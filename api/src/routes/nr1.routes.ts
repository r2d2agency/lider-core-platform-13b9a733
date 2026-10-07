import { Router, type Response } from "express";
import { z } from "zod";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { env } from "../env.js";
import { randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";
import { notifyInApp } from "../lib/notifications.js";
import { completeChat } from "../lib/ai-gateway.js";
import {
  NR1_FACTORS,
  NR1_MIN_RESPONSES,
  NR1_QUESTIONS,
  NR1_QUESTION_IDS,
  nr1FactorResults,
  nr1Message,
  nr1QuestionTabulation,
  type NR1Answers,
} from "../lib/nr1-instrument.js";

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

export const QUESTIONS = NR1_QUESTIONS;

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

const ACTION_ORIGINS = [
  "core_assessment",
  "risk_inventory",
  "existing_action_plan",
  "external_assessment",
  "leader_identification",
  "other",
] as const;
const ACTION_STATUSES = ["not_started", "in_progress", "completed", "overdue", "cancelled"] as const;
const ACTION_OUTCOMES = ["improved", "partially_improved", "unchanged", "worsened", "not_assessable"] as const;
const ACTION_SUFFICIENCY = ["sufficient", "partial", "insufficient", "pending"] as const;
const actionSchema = z.object({
  surveyId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
  factorId: z.string().min(1).max(80).optional().nullable(),
  factorAnalysisId: z.string().uuid().optional().nullable(),
  origin: z.enum(ACTION_ORIGINS).default("leader_identification"),
  situation: z.string().min(2).max(500),
  description: z.string().min(2).max(5000),
  responsibleUserId: z.string().uuid().optional().nullable(),
  responsibleLabel: z.string().max(160).optional().nullable(),
  dueDate: z.string().datetime().optional().nullable(),
  status: z.enum(ACTION_STATUSES).default("not_started"),
  followUpMethod: z.string().max(1000).optional().nullable(),
  result: z.string().max(5000).optional().nullable(),
  outcome: z.enum(ACTION_OUTCOMES).optional().nullable(),
  sufficiency: z.enum(ACTION_SUFFICIENCY).optional().nullable(),
  sufficiencyNote: z.string().max(2000).optional().nullable(),
  nextCheckAt: z.string().datetime().optional().nullable(),
  cancelReason: z.string().max(1000).optional().nullable(),
});
const actionUpdateSchema = actionSchema.partial().omit({ origin: true });

function actionDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}
function appendHistory(history: unknown, event: string, userId: string) {
  const current = Array.isArray(history) ? history : [];
  return [...current, { event, at: new Date().toISOString(), by: userId }];
}

const NR1_EVIDENCE_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);
const nr1EvidenceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(env.UPLOADS_DIR, "nr1-evidence");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      cb(null, `${Date.now()}-${randomBytes(12).toString("hex")}${/^\\.[a-z0-9]+$/.test(ext) ? ext : ".bin"}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!NR1_EVIDENCE_MIME.has(file.mimetype)) return cb(new Error("Formato não suportado. Use PDF, imagem ou TXT."));
    cb(null, true);
  },
});

nr1Router.post("/:orgId/nr1/actions/:id/evidence", (req, res) => {
  nr1EvidenceUpload.single("file")(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: "Arquivo ausente." });
    const action = await prisma.nR1Action.findFirst({ where: { id: req.params.id, organizationId: req.params.orgId } });
    if (!action) return res.status(404).json({ error: "Ação não encontrada." });
    const item = {
      url: `${(env.PUBLIC_API_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "")}/uploads/nr1-evidence/${req.file.filename}`,
      path: `/uploads/nr1-evidence/${req.file.filename}`,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      uploadedAt: new Date().toISOString(),
      uploadedBy: req.userId,
    };
    const evidence = Array.isArray(action.evidence) ? action.evidence : [];
    const updated = await prisma.nR1Action.update({ where: { id: action.id }, data: { evidence: [...evidence, item], updatedBy: req.userId! } });
    res.status(201).json({ evidence: item, action: updated });
  });
});

nr1Router.get("/:orgId/nr1/actions", async (req, res) => {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  if (status && !ACTION_STATUSES.includes(status as (typeof ACTION_STATUSES)[number])) {
    return res.status(400).json({ error: "Status inválido." });
  }
  const actions = await prisma.nR1Action.findMany({
    where: { organizationId: req.params.orgId, ...(status ? { status: status as never } : {}) },
    orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
  });
  res.json(actions);
});

nr1Router.post("/:orgId/nr1/actions", async (req, res) => {
  try {
    const data = actionSchema.parse(req.body);
    if (data.status === "cancelled" && !data.cancelReason?.trim()) {
      return res.status(400).json({ error: "Ações canceladas precisam de justificativa." });
    }

    if (data.surveyId) {
      const survey = await prisma.nR1Survey.findFirst({
        where: { id: data.surveyId, organizationId: req.params.orgId },
        select: { id: true, teamId: true },
      });
      if (!survey) return res.status(404).json({ error: "Avaliação não encontrada." });
      if (data.teamId && survey.teamId && data.teamId !== survey.teamId) {
        return res.status(400).json({ error: "A equipe não corresponde à avaliação." });
      }
    }

    const action = await prisma.nR1Action.create({
      data: {
        organizationId: req.params.orgId,
        surveyId: data.surveyId ?? null,
        teamId: data.teamId ?? null,
        factorId: data.factorId ?? null,
        factorAnalysisId: data.factorAnalysisId ?? null,
        origin: data.origin,
        situation: data.situation,
        description: data.description,
        responsibleUserId: data.responsibleUserId ?? null,
        responsibleLabel: data.responsibleLabel ?? null,
        dueDate: actionDate(data.dueDate),
        status: data.status,
        followUpMethod: data.followUpMethod ?? null,
        result: data.result ?? null,
        cancelReason: data.cancelReason ?? null,
        history: [{ event: "created", at: new Date().toISOString(), by: req.userId }],
        createdBy: req.userId!,
      },
    });
    res.status(201).json(action);
  } catch (err) {
    badReq(res, err);
  }
});

nr1Router.patch("/:orgId/nr1/actions/:id", async (req, res) => {
  try {
    const data = actionUpdateSchema.parse(req.body);
    const current = await prisma.nR1Action.findFirst({
      where: { id: req.params.id, organizationId: req.params.orgId },
    });
    if (!current) return res.status(404).json({ error: "Ação não encontrada." });
    if (data.status === "cancelled" && !data.cancelReason?.trim() && !current.cancelReason) {
      return res.status(400).json({ error: "Ações canceladas precisam de justificativa." });
    }
    const action = await prisma.nR1Action.update({
      where: { id: current.id },
      data: {
        ...(data.situation !== undefined ? { situation: data.situation } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.teamId !== undefined ? { teamId: data.teamId ?? null } : {}),
        ...(data.surveyId !== undefined ? { surveyId: data.surveyId ?? null } : {}),
        ...(data.factorId !== undefined ? { factorId: data.factorId ?? null } : {}),
        ...(data.factorAnalysisId !== undefined ? { factorAnalysisId: data.factorAnalysisId ?? null } : {}),
        ...(data.responsibleUserId !== undefined ? { responsibleUserId: data.responsibleUserId ?? null } : {}),
        ...(data.responsibleLabel !== undefined ? { responsibleLabel: data.responsibleLabel ?? null } : {}),
        ...(data.dueDate !== undefined ? { dueDate: actionDate(data.dueDate) } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.followUpMethod !== undefined ? { followUpMethod: data.followUpMethod ?? null } : {}),
        ...(data.result !== undefined ? { result: data.result ?? null } : {}),
        ...(data.outcome !== undefined ? { outcome: data.outcome ?? null } : {}),
        ...(data.sufficiency !== undefined ? { sufficiency: data.sufficiency ?? null } : {}),
        ...(data.sufficiencyNote !== undefined ? { sufficiencyNote: data.sufficiencyNote ?? null } : {}),
        ...(data.nextCheckAt !== undefined ? { nextCheckAt: actionDate(data.nextCheckAt) } : {}),
        ...(data.cancelReason !== undefined ? { cancelReason: data.cancelReason ?? null } : {}),
        updatedBy: req.userId!,
        history: appendHistory(
          current.history,
          data.status
            ? `status:${data.status}`
            : data.outcome
              ? `outcome:${data.outcome}`
              : data.sufficiency
                ? `sufficiency:${data.sufficiency}`
                : "updated",
          req.userId!,
        ),
      },
    });
    res.json(action);
  } catch (err) {
    badReq(res, err);
  }
});

nr1Router.delete("/:orgId/nr1/actions/:id", async (req, res) => {
  const result = await prisma.nR1Action.deleteMany({
    where: { id: req.params.id, organizationId: req.params.orgId },
  });
  if (!result.count) return res.status(404).json({ error: "Ação não encontrada." });
  res.status(204).end();
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
    include: {
      responses: { orderBy: { createdAt: "desc" } },
      factorAnalyses: true,
    },
  });
  if (!s) return res.status(404).json({ error: "Pesquisa não encontrada" });

  const answersList = s.responses.map((r) => r.answers as NR1Answers);
  // Marco 3.5 — resultados só com o mínimo de respostas válidas (anonimato).
  const insufficient = s.responses.length < NR1_MIN_RESPONSES;
  const factors = insufficient ? [] : nr1FactorResults(answersList);

  // Marco 6.7 — evolução: compara com a rodada anterior da mesma equipe
  // (mesmo teamId) encerrada antes do início desta, ou a anterior sem equipe.
  const previous = await prisma.nR1Survey.findFirst({
    where: {
      organizationId: s.organizationId,
      teamId: s.teamId,
      id: { not: s.id },
      createdAt: { lt: s.createdAt },
      responses: { some: {} },
    },
    orderBy: { createdAt: "desc" },
    include: { responses: true },
  });
  let previousFactors: typeof factors = [];
  let previousLabel: string | null = null;
  if (previous && previous.responses.length >= NR1_MIN_RESPONSES) {
    previousFactors = nr1FactorResults(
      previous.responses.map((r) => r.answers as NR1Answers),
    );
    previousLabel = previous.title;
  }

  res.json({
    ...s,
    responses: s.responses.map((r) => ({
      id: r.id,
      riskScore: r.riskScore,
      createdAt: r.createdAt,
    })),
    tabulation: nr1QuestionTabulation(answersList),
    factors,
    resultAvailable: !insufficient,
    insufficientMessage: insufficient ? nr1Message("insufficient") : null,
    previousLabel,
    previousFactors,
    factorAnalyses: s.factorAnalyses,
  });
});

// Análise do líder por fator (Marco 7.7/7.8): texto, contexto e decisão.
const factorAnalysisSchema = z.object({
  factorId: z.string().min(1),
  text: z.string().max(4000).nullable(),
  contexts: z.array(z.string().max(120)).max(10).default([]),
  decision: z.enum(["criar_acao", "acao_existente", "acompanhar", "sem_acao"]).nullable(),
});

nr1Router.put("/:orgId/nr1/surveys/:id/factor-analysis", async (req, res) => {
  try {
    const data = factorAnalysisSchema.parse(req.body);
    const survey = await prisma.nR1Survey.findFirst({
      where: { id: req.params.id, organizationId: req.params.orgId },
      select: { id: true },
    });
    if (!survey) return res.status(404).json({ error: "Pesquisa não encontrada" });

    const analysis = await prisma.nR1FactorAnalysis.upsert({
      where: {
        surveyId_factorId: { surveyId: survey.id, factorId: data.factorId },
      },
      create: {
        surveyId: survey.id,
        factorId: data.factorId,
        text: data.text,
        contexts: data.contexts,
        decision: data.decision ?? null,
        createdBy: req.userId!,
      },
      update: {
        text: data.text,
        contexts: data.contexts,
        decision: data.decision ?? null,
      },
    });
    res.json(analysis);
  } catch (err) {
    badReq(res, err);
  }
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

  const answersList = survey.responses.map((r) => r.answers as NR1Answers);
  const factorResults = nr1FactorResults(answersList);
  const tabulation = nr1QuestionTabulation(answersList);

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
            scale: "1 a 5; percentual = ((média − 1) ÷ 4) × 100; menor percentual representa maior atenção",
            aggregatedResults: factorResults,
            questionResults: tabulation,
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
  res.json({ title: s.title, questions: QUESTIONS, factors: NR1_FACTORS });
});

// Escala 1–5 + N/A (Marco 3.4). N/A não entra no cálculo dos fatores.
const answerSchema = z.object({
  answers: z.record(z.string(), z.union([z.number().min(1).max(5), z.literal("na")])),
});

publicNr1Router.post("/nr1/survey/:token/answer", async (req, res) => {
  try {
    const s = await prisma.nR1Survey.findUnique({ where: { token: req.params.token } });
    if (!s || s.status !== "open")
      return res.status(404).json({ error: "Pesquisa não encontrada ou encerrada." });

    const data = answerSchema.parse(req.body);
    const values = NR1_QUESTION_IDS.map((id) => data.answers[id]).filter(
      (v): v is number => typeof v === "number",
    );
    if (values.length === 0) return badReq(res, new Error("Responda ao menos uma pergunta válida."));
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
