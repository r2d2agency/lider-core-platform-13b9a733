import { Router, type Response } from "express";
import { z } from "zod";
import { randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";
import { notifyInApp } from "../lib/notifications.js";
import { completeChat } from "../lib/ai-gateway.js";

/**
 * NR-1 — Diagnóstico de riscos psicossociais + canal de denúncia anônima
 * (item 6 do PDF de reorganização).
 *
 * Respostas do diagnóstico são anônimas por design: nada no NR1Response
 * identifica o respondente. Denúncias vão para um link permanente por
 * organização (NR1ComplaintChannel) e notificam apenas os líderes
 * autorizados (hr_admin / franchise_owner / super/neo admin) — nunca o
 * time inteiro, pra não expor o denunciante nem rotear pro possível alvo.
 */

export const QUESTIONS = [
  { id: "carga", label: "Minha carga de trabalho é adequada para o tempo que tenho." },
  { id: "autonomia", label: "Tenho autonomia para tomar decisões no meu trabalho." },
  { id: "seguranca_psicologica", label: "Posso expressar minhas opiniões sem medo de retaliação." },
  { id: "relacoes", label: "As relações com colegas e liderança são respeitosas." },
  { id: "reconhecimento", label: "Recebo reconhecimento adequado pelo meu trabalho." },
  { id: "clareza", label: "Tenho clareza sobre o que se espera de mim." },
  { id: "suporte_lideranca", label: "Minha liderança me apoia quando preciso." },
  { id: "equilibrio", label: "Consigo equilibrar vida pessoal e trabalho." },
] as const;
const QUESTION_IDS = QUESTIONS.map((q) => q.id);

function genToken() {
  return randomBytes(24).toString("base64url");
}
function badReq(res: Response, err: unknown) {
  return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
}
async function isSuper(userId: string) {
  const r = await prisma.userRole.findFirst({
    where: { userId, role: { in: ["super_admin", "neo_admin"] } },
  });
  return !!r;
}
async function assertOrgAccess(userId: string, orgId: string) {
  if (await isSuper(userId)) return true;
  const m = await prisma.membership.findFirst({ where: { userId, organizationId: orgId } });
  return !!m;
}
async function isExec(userId: string, orgId: string) {
  if (await isSuper(userId)) return true;
  const m = await prisma.membership.findFirst({
    where: { userId, organizationId: orgId, role: { in: ["hr_admin", "franchise_owner"] } },
  });
  return !!m;
}
async function notifyAuthorizedLeaders(orgId: string, title: string, body: string) {
  const leaders = await prisma.membership.findMany({
    where: { organizationId: orgId, role: { in: ["hr_admin", "franchise_owner"] } },
    select: { userId: true },
  });
  await Promise.all(
    leaders.map((l) =>
      notifyInApp({
        userId: l.userId,
        organizationId: orgId,
        title,
        body,
        linkUrl: "/app/nr1",
      }).catch(() => null),
    ),
  );
}

// ============================================================
// Autenticado — gestão de rodadas de diagnóstico e denúncias
// ============================================================
export const nr1Router = Router();
nr1Router.use(requireAuth);

nr1Router.param("orgId", async (req, res, next, orgId) => {
  if (!(await assertOrgAccess(req.userId!, orgId)))
    return res.status(403).json({ error: "Forbidden" });
  next();
});

nr1Router.get("/:orgId/nr1/surveys", async (req, res) => {
  const surveys = await prisma.nR1Survey.findMany({
    where: { organizationId: req.params.orgId },
    orderBy: { createdAt: "desc" },
    include: { _count: { select: { responses: true } } },
  });
  const withAvg = await Promise.all(
    surveys.map(async (s) => {
      const agg = await prisma.nR1Response.aggregate({
        where: { surveyId: s.id },
        _avg: { riskScore: true },
      });
      return { ...s, responseCount: s._count.responses, avgScore: agg._avg.riskScore };
    }),
  );
  res.json(withAvg);
});

const surveySchema = z.object({
  title: z.string().min(2),
  teamId: z.string().uuid().optional().nullable(),
});

nr1Router.post("/:orgId/nr1/surveys", async (req, res) => {
  try {
    const data = surveySchema.parse(req.body);
    const s = await prisma.nR1Survey.create({
      data: {
        organizationId: req.params.orgId,
        title: data.title,
        teamId: data.teamId ?? null,
        token: genToken(),
        createdBy: req.userId!,
      },
    });
    res.status(201).json(s);
  } catch (err) {
    badReq(res, err);
  }
});

nr1Router.get("/:orgId/nr1/surveys/:id", async (req, res) => {
  const s = await prisma.nR1Survey.findFirst({
    where: { id: req.params.id, organizationId: req.params.orgId },
    include: { responses: { orderBy: { createdAt: "desc" } } },
  });
  if (!s) return res.status(404).json({ error: "Pesquisa não encontrada" });

  const tabulation = QUESTIONS.map((q) => {
    const values = s.responses
      .map((r) => (r.answers as Record<string, number>)[q.id])
      .filter((v): v is number => typeof v === "number");
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return { id: q.id, label: q.label, avg, count: values.length };
  });

  res.json({
    ...s,
    responses: s.responses.map((r) => ({
      id: r.id,
      riskScore: r.riskScore,
      createdAt: r.createdAt,
    })),
    tabulation,
  });
});

const aiAnalysisSchema = z.object({
  summary: z.string(),
  priorities: z.array(
    z.object({ factor: z.string(), evidence: z.string(), recommendation: z.string() }),
  ),
  actionPlan: z.string(),
  recommendedNextAssessment: z.object({
    id: z.enum(["completo", "pulso", "lideranca", "assedio"]),
    reason: z.string(),
  }),
});

nr1Router.post("/:orgId/nr1/surveys/:id/ai-analysis", async (req, res) => {
  const survey = await prisma.nR1Survey.findFirst({
    where: { id: req.params.id, organizationId: req.params.orgId },
    include: { responses: true },
  });
  if (!survey) return res.status(404).json({ error: "Pesquisa não encontrada" });
  if (survey.responses.length < 3) {
    return res.status(400).json({
      error: "São necessárias pelo menos 3 respostas para proteger o anonimato e gerar a análise.",
    });
  }

  const tabulation = QUESTIONS.map((question) => {
    const values = survey.responses
      .map((response) => (response.answers as Record<string, number>)[question.id])
      .filter((value): value is number => typeof value === "number");
    return {
      factor: question.label,
      average: values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null,
      responses: values.length,
    };
  });

  try {
    const raw = await completeChat({
      messages: [
        {
          role: "system",
          content:
            "Você apoia o gerenciamento de fatores de risco psicossociais relacionados ao trabalho no GRO/PGR da NR-1. " +
            "Analise somente dados agregados; não faça diagnóstico clínico, não identifique indivíduos e não declare conformidade legal. " +
            "Notas menores indicam pior percepção e maior prioridade. Sugira medidas sobre a organização do trabalho, com responsável, prazo e evidência de acompanhamento. " +
            "Responda apenas JSON válido, sem markdown.",
        },
        {
          role: "user",
          content: JSON.stringify({
            survey: survey.title,
            responseCount: survey.responses.length,
            scale: "1 a 5; menor nota representa maior atenção",
            aggregatedResults: tabulation,
            availableAssessments: [
              {
                id: "completo",
                name: "Diagnóstico completo",
                use: "linha de base e revisão ampla",
              },
              {
                id: "pulso",
                name: "Pulso de acompanhamento",
                use: "verificar evolução após ações",
              },
              {
                id: "lideranca",
                name: "Apoio e práticas de liderança",
                use: "aprofundar autonomia, clareza e suporte",
              },
              {
                id: "assedio",
                name: "Respeito, assédio e violência",
                use: "aprofundar sinais de desrespeito com protocolo protegido",
              },
            ],
            output: {
              summary: "síntese em até 3 frases",
              priorities: [{ factor: "fator", evidence: "dado agregado", recommendation: "ação" }],
              actionPlan:
                "plano textual com até 3 ações no formato ação | responsável sugerido | prazo | evidência",
              recommendedNextAssessment: {
                id: "completo|pulso|lideranca|assedio",
                reason: "motivo",
              },
            },
          }),
        },
      ],
    });
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    const parsed = aiAnalysisSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
    res.json({ ...parsed, generatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("[nr1/ai-analysis]", error);
    res
      .status(500)
      .json({ error: error instanceof Error ? error.message : "Falha ao gerar análise" });
  }
});

const surveyUpdateSchema = z.object({
  title: z.string().min(2).optional(),
  status: z.enum(["open", "closed"]).optional(),
  actionPlan: z.string().optional().nullable(),
});

nr1Router.patch("/:orgId/nr1/surveys/:id", async (req, res) => {
  try {
    const data = surveyUpdateSchema.parse(req.body);
    const result = await prisma.nR1Survey.updateMany({
      where: { id: req.params.id, organizationId: req.params.orgId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.status !== undefined
          ? { status: data.status, closedAt: data.status === "closed" ? new Date() : null }
          : {}),
        ...(data.actionPlan !== undefined ? { actionPlan: data.actionPlan ?? null } : {}),
      },
    });
    if (!result.count) return res.status(404).json({ error: "Pesquisa não encontrada" });
    const survey = await prisma.nR1Survey.findUnique({ where: { id: req.params.id } });
    res.json(survey);
  } catch (err) {
    badReq(res, err);
  }
});

nr1Router.delete("/:orgId/nr1/surveys/:id", async (req, res) => {
  await prisma.nR1Survey.deleteMany({
    where: { id: req.params.id, organizationId: req.params.orgId },
  });
  res.status(204).end();
});

// Link permanente de denúncia anônima da organização (criado sob demanda).
nr1Router.get("/:orgId/nr1/complaint-channel", async (req, res) => {
  const orgId = req.params.orgId;
  let channel = await prisma.nR1ComplaintChannel.findUnique({ where: { organizationId: orgId } });
  if (!channel) {
    channel = await prisma.nR1ComplaintChannel.create({
      data: { organizationId: orgId, token: genToken() },
    });
  }
  res.json(channel);
});

nr1Router.get("/:orgId/nr1/complaints", async (req, res) => {
  if (!(await isExec(req.userId!, req.params.orgId)))
    return res.status(403).json({ error: "Forbidden" });
  const complaints = await prisma.nR1Complaint.findMany({
    where: { organizationId: req.params.orgId },
    orderBy: { createdAt: "desc" },
  });
  res.json(complaints);
});

const complaintUpdateSchema = z.object({ status: z.enum(["open", "in_review", "resolved"]) });

nr1Router.patch("/:orgId/nr1/complaints/:id", async (req, res) => {
  if (!(await isExec(req.userId!, req.params.orgId)))
    return res.status(403).json({ error: "Forbidden" });
  try {
    const data = complaintUpdateSchema.parse(req.body);
    const result = await prisma.nR1Complaint.updateMany({
      where: { id: req.params.id, organizationId: req.params.orgId },
      data: { status: data.status },
    });
    if (!result.count) return res.status(404).json({ error: "Denúncia não encontrada" });
    const complaint = await prisma.nR1Complaint.findUnique({ where: { id: req.params.id } });
    res.json(complaint);
  } catch (err) {
    badReq(res, err);
  }
});

// ============================================================
// Público (sem login) — resposta ao diagnóstico e denúncia anônima
// ============================================================
export const publicNr1Router = Router();

publicNr1Router.get("/nr1/survey/:token", async (req, res) => {
  const s = await prisma.nR1Survey.findUnique({ where: { token: req.params.token } });
  if (!s || s.status !== "open")
    return res.status(404).json({ error: "Pesquisa não encontrada ou encerrada." });
  res.json({ title: s.title, questions: QUESTIONS });
});

const answerSchema = z.object({ answers: z.record(z.string(), z.number().min(1).max(5)) });

publicNr1Router.post("/nr1/survey/:token/answer", async (req, res) => {
  try {
    const s = await prisma.nR1Survey.findUnique({ where: { token: req.params.token } });
    if (!s || s.status !== "open")
      return res.status(404).json({ error: "Pesquisa não encontrada ou encerrada." });

    const data = answerSchema.parse(req.body);
    const values = QUESTION_IDS.map((id) => data.answers[id]).filter(
      (v): v is number => typeof v === "number",
    );
    if (values.length === 0) return badReq(res, new Error("Responda ao menos uma pergunta."));
    const riskScore = values.reduce((a, b) => a + b, 0) / values.length;

    await prisma.nR1Response.create({
      data: {
        surveyId: s.id,
        answers: data.answers as unknown as object,
        riskScore,
      },
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    badReq(res, err);
  }
});

publicNr1Router.get("/nr1/complaint/:token", async (req, res) => {
  const channel = await prisma.nR1ComplaintChannel.findUnique({
    where: { token: req.params.token },
  });
  if (!channel) return res.status(404).json({ error: "Canal não encontrado." });
  res.json({ ok: true });
});

const complaintSchema = z.object({
  message: z.string().min(5),
  category: z.string().optional().nullable(),
});

publicNr1Router.post("/nr1/complaint/:token", async (req, res) => {
  try {
    const channel = await prisma.nR1ComplaintChannel.findUnique({
      where: { token: req.params.token },
    });
    if (!channel) return res.status(404).json({ error: "Canal não encontrado." });

    const data = complaintSchema.parse(req.body);
    await prisma.nR1Complaint.create({
      data: {
        organizationId: channel.organizationId,
        message: data.message,
        category: data.category ?? null,
      },
    });

    void notifyAuthorizedLeaders(
      channel.organizationId,
      "Nova denúncia anônima (NR-1)",
      "Uma denúncia anônima foi registrada. Nenhuma informação do denunciante foi coletada.",
    );

    res.status(201).json({ ok: true });
  } catch (err) {
    badReq(res, err);
  }
});
