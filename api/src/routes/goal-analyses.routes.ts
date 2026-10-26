import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import type { AppRole } from "@prisma/client";
import { requireAuth } from "../auth.js";
import { notifyInApp } from "../lib/notifications.js";

/**
 * Metas da Corporação — Passo 3 (análise do líder + fluxo de revisão).
 *
 * Um líder envia sua análise por ciclo com itens por meta corporativa
 * (contribuição, metas de ciclo vinculadas, gaps). O superior aprova/devolve
 * com comentário. 5 eventos geram notificação in-app não-bloqueante.
 */

export const goalAnalysesRouter = Router();
goalAnalysesRouter.use(requireAuth);

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

const EXEC_ROLES: AppRole[] = ["hr_admin", "franchise_owner"];

async function isExec(userId: string, orgId: string) {
  if (await isSuper(userId)) return true;
  const m = await prisma.membership.findFirst({
    where: { userId, organizationId: orgId, role: { in: EXEC_ROLES } },
  });
  return !!m;
}

goalAnalysesRouter.param("orgId", async (req, res, next, orgId) => {
  if (!(await assertOrgAccess(req.userId!, orgId))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

const itemSchema = z.object({
  corporateGoalId: z.string().uuid(),
  contribution: z.string().min(1, "Contribuição é obrigatória"),
  linkedCycleGoalIds: z.array(z.string().uuid()).default([]),
  gap: z.string().optional().nullable(),
  orderIndex: z.number().int().optional(),
});

const createSchema = z.object({
  cycleId: z.string().uuid(),
  reviewerUserId: z.string().uuid().optional().nullable(),
  items: z.array(itemSchema).min(1, "Adicione pelo menos um item"),
});

const updateSchema = z.object({
  reviewerUserId: z.string().uuid().optional().nullable(),
  items: z.array(itemSchema).min(1).optional(),
  reviewComment: z.string().optional().nullable(),
});

const reviewSchema = z.object({
  action: z.enum(["approve", "return"]),
  reviewComment: z.string().optional().nullable(),
});

async function findReviewer(orgId: string, authorUserId: string, preferred?: string | null) {
  if (preferred) {
    const m = await prisma.membership.findFirst({ where: { userId: preferred, organizationId: orgId } });
    if (m) return preferred;
  }
  const membership = await prisma.membership.findFirst({
    where: { userId: authorUserId, organizationId: orgId },
    include: { area: true, team: true },
  });
  if (membership?.area?.managerUserId) return membership.area.managerUserId;
  if (membership?.team?.responsibleUserId) return membership.team.responsibleUserId;
  // fallback: executivos/donos
  const exec = await prisma.membership.findFirst({
    where: { organizationId: orgId, role: { in: EXEC_ROLES } },
    select: { userId: true },
  });
  if (exec) return exec.userId;
  const superExec = await prisma.userRole.findFirst({
    where: { role: { in: ["super_admin", "neo_admin"] } },
    select: { userId: true },
  });
  return superExec?.userId ?? null;
}

async function resolveNames(ids: Array<string | null | undefined>) {
  const unique = Array.from(new Set(ids.filter((id): id is string => !!id)));
  if (!unique.length) return {} as Record<string, string>;
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true, profile: { select: { fullName: true } } },
  });
  return Object.fromEntries(users.map((u) => [u.id, u.profile?.fullName ?? u.email]));
}

const ANALYSIS_INCLUDE = {
  items: {
    orderBy: { orderIndex: "asc" },
    include: {
      corporateGoal: {
        include: { indicator: { select: { id: true, name: true, unit: true } } },
      },
    },
  },
  cycle: { select: { id: true, name: true, startAt: true, endAt: true, status: true } },
};

async function serialize(analysis: any) {
  const names = await resolveNames([analysis.authorUserId, analysis.reviewerUserId]);
  return { ...analysis, userNames: names };
}

// Listar análises da org (filtrável) ou minhas
goalAnalysesRouter.get("/:orgId/goal-analyses", async (req, res) => {
  const orgId = req.params.orgId;
  const userId = req.userId!;
  try {
    const scope = typeof req.query.scope === "string" ? req.query.scope : "mine";
    const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;

    let where: any = { organizationId: orgId };
    if (cycleId) where.cycleId = cycleId;
    if (status) where.status = status;

    if (scope === "mine") {
      where.authorUserId = userId;
    } else if (scope === "review") {
      // análises para revisar pelo usuário atual
      where.reviewerUserId = userId;
      if (status === "pending") where.status = { in: ["submitted"] };
    } else if (scope === "all") {
      const exec = await isExec(userId, orgId);
      if (!exec && ! (await isSuper(userId))) {
        return res.status(403).json({ error: "Apenas dono/executivo pode listar todas as análises" });
      }
    } else {
      where.authorUserId = userId;
    }

    const analyses = await prisma.leaderGoalAnalysis.findMany({
      where,
      include: ANALYSIS_INCLUDE,
      orderBy: { updatedAt: "desc" },
    });
    const serialized = await Promise.all(analyses.map((a) => serialize(a)));
    res.json(serialized);
  } catch (err) {
    console.error("[goal-analyses] list", err);
    res.status(500).json({ error: "Falha ao listar análises" });
  }
});

// Obter análise por id
goalAnalysesRouter.get("/:orgId/goal-analyses/:id", async (req, res) => {
  const orgId = req.params.orgId;
  const userId = req.userId!;
  const { id } = req.params;
  try {
    const analysis = await prisma.leaderGoalAnalysis.findFirst({
      where: { id, organizationId: orgId },
      include: ANALYSIS_INCLUDE,
    });
    if (!analysis) return res.status(404).json({ error: "Análise não encontrada" });
    const exec = await isExec(userId, orgId);
    const canView =
      analysis.authorUserId === userId || analysis.reviewerUserId === userId || exec || (await isSuper(userId));
    if (!canView) return res.status(403).json({ error: "Forbidden" });
    res.json(await serialize(analysis));
  } catch (err) {
    badReq(res, err);
  }
});

// Criar rascunho
goalAnalysesRouter.post("/:orgId/goal-analyses", async (req, res) => {
  const orgId = req.params.orgId;
  const userId = req.userId!;
  try {
    const parsed = createSchema.parse(req.body);
    const cycle = await prisma.cycle.findFirst({ where: { id: parsed.cycleId, organizationId: orgId } });
    if (!cycle) return res.status(404).json({ error: "Ciclo não encontrado" });

    // garantir briefing publicado para orientação (não bloqueia rascunho)
    const briefing = await prisma.corporateGoalBriefing.findUnique({
      where: { organizationId_cycleId: { organizationId: orgId, cycleId: parsed.cycleId } },
    });
    if (!briefing) return res.status(400).json({ error: "Não há briefing da corporação para este ciclo" });

    const reviewerUserId = await findReviewer(orgId, userId, parsed.reviewerUserId);
    if (!reviewerUserId) return res.status(400).json({ error: "Não foi possível identificar o superior para revisão" });

    const analysis = await prisma.leaderGoalAnalysis.create({
      data: {
        organizationId: orgId,
        cycleId: parsed.cycleId,
        authorUserId: userId,
        reviewerUserId,
        status: "draft",
        items: {
          create: parsed.items.map((item, idx) => ({
            corporateGoalId: item.corporateGoalId,
            contribution: item.contribution,
            linkedCycleGoalIds: item.linkedCycleGoalIds ?? [],
            gap: item.gap ?? null,
            orderIndex: item.orderIndex ?? idx,
          })),
        },
      },
      include: ANALYSIS_INCLUDE,
    });
    res.status(201).json(await serialize(analysis));
  } catch (err) {
    badReq(res, err);
  }
});

// Editar rascunho (ou superior comentar enquanto em review? permitir autor editar apenas draft/returned)
goalAnalysesRouter.patch("/:orgId/goal-analyses/:id", async (req, res) => {
  const orgId = req.params.orgId;
  const userId = req.userId!;
  const { id } = req.params;
  try {
    const parsed = updateSchema.parse(req.body);
    const existing = await prisma.leaderGoalAnalysis.findFirst({ where: { id, organizationId: orgId } });
    if (!existing) return res.status(404).json({ error: "Análise não encontrada" });

    if (existing.authorUserId !== userId) {
      // superior pode comentar em análise enviada/devolvida/aprovada? permitir apenas reviewComment via review; bloquear edição de itens
      if (existing.reviewerUserId !== userId) return res.status(403).json({ error: "Forbidden" });
      if (parsed.items) return res.status(403).json({ error: "Somente o autor edita os itens da análise" });
      const updated = await prisma.leaderGoalAnalysis.update({
        where: { id },
        data: { reviewComment: parsed.reviewComment ?? existing.reviewComment },
        include: ANALYSIS_INCLUDE,
      });
      return res.json(await serialize(updated));
    }

    if (existing.status !== "draft" && existing.status !== "returned") {
      return res.status(400).json({ error: "Apenas rascunho ou análise devolvida pode ser editada" });
    }

    const reviewerUserId = parsed.reviewerUserId ?? (await findReviewer(orgId, userId, existing.reviewerUserId)) ?? existing.reviewerUserId;

    const updated = await prisma.$transaction(async (tx) => {
      if (parsed.items) {
        await tx.leaderGoalAnalysisItem.deleteMany({ where: { analysisId: id } });
        await tx.leaderGoalAnalysisItem.createMany({
          data: parsed.items.map((item, idx) => ({
            analysisId: id,
            corporateGoalId: item.corporateGoalId,
            contribution: item.contribution,
            linkedCycleGoalIds: item.linkedCycleGoalIds ?? [],
            gap: item.gap ?? null,
            orderIndex: item.orderIndex ?? idx,
          })),
        });
      }
      return tx.leaderGoalAnalysis.update({
        where: { id },
        data: {
          reviewerUserId,
          reviewComment: parsed.reviewComment ?? existing.reviewComment,
        },
        include: ANALYSIS_INCLUDE,
      });
    });
    res.json(await serialize(updated));
  } catch (err) {
    badReq(res, err);
  }
});

// Enviar análise → notifica superior
goalAnalysesRouter.post("/:orgId/goal-analyses/:id/submit", async (req, res) => {
  const orgId = req.params.orgId;
  const userId = req.userId!;
  const { id } = req.params;
  try {
    const existing = await prisma.leaderGoalAnalysis.findFirst({
      where: { id, organizationId: orgId },
      include: { items: true, cycle: { select: { name: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Análise não encontrada" });
    if (existing.authorUserId !== userId) return res.status(403).json({ error: "Apenas o autor envia a análise" });
    if (existing.status !== "draft" && existing.status !== "returned") {
      return res.status(400).json({ error: "Esta análise não pode ser enviada" });
    }
    if (existing.items.length === 0) return res.status(400).json({ error: "Adicione itens à análise antes de enviar" });

    const reviewerUserId = existing.reviewerUserId ?? (await findReviewer(orgId, userId, null));
    if (!reviewerUserId) return res.status(400).json({ error: "Não há superior definido para revisão" });

    const updated = await prisma.leaderGoalAnalysis.update({
      where: { id },
      data: { status: "submitted", reviewerUserId, submittedAt: new Date() },
      include: ANALYSIS_INCLUDE,
    });

    const authorName = (await resolveNames([userId]))[userId] ?? "Líder";
    await notifyInApp({
      userId: reviewerUserId,
      organizationId: orgId,
      title: `Análise de metas de ${authorName}`,
      body: `O líder enviou a análise de metas para o ciclo ${existing.cycle?.name ?? ""}.`,
      linkUrl: `/app/goals/analysis/${id}`,
    }).catch((e) => console.error("[goal-analyses] notify submit", e));

    res.json(await serialize(updated));
  } catch (err) {
    badReq(res, err);
  }
});

// Aprovar ou devolver → notifica autor
goalAnalysesRouter.post("/:orgId/goal-analyses/:id/review", async (req, res) => {
  const orgId = req.params.orgId;
  const userId = req.userId!;
  const { id } = req.params;
  try {
    const parsed = reviewSchema.parse(req.body);
    const existing = await prisma.leaderGoalAnalysis.findFirst({
      where: { id, organizationId: orgId },
      include: { cycle: { select: { name: true } } },
    });
    if (!existing) return res.status(404).json({ error: "Análise não encontrada" });
    if (existing.reviewerUserId !== userId && !(await isExec(userId, orgId)) && !(await isSuper(userId))) {
      return res.status(403).json({ error: "Apenas o superior designado ou executivo pode revisar" });
    }
    if (existing.status !== "submitted") return res.status(400).json({ error: "Apenas análises enviadas podem ser revistas" });

    if (parsed.action === "approve") {
      const updated = await prisma.leaderGoalAnalysis.update({
        where: { id },
        data: {
          status: "approved",
          reviewComment: parsed.reviewComment ?? existing.reviewComment,
          reviewedAt: new Date(),
        },
        include: ANALYSIS_INCLUDE,
      });
      await notifyInApp({
        userId: existing.authorUserId,
        organizationId: orgId,
        title: "Análise de metas aprovada",
        body: `Sua análise de metas para o ciclo ${existing.cycle?.name ?? ""} foi aprovada.${parsed.reviewComment ? ` Comentário: ${parsed.reviewComment}` : ""}`,
        linkUrl: `/app/goals/analysis/${id}`,
      }).catch((e) => console.error("[goal-analyses] notify approve", e));
      return res.json(await serialize(updated));
    } else {
      if (!parsed.reviewComment || parsed.reviewComment.trim().length === 0) {
        return res.status(400).json({ error: "Informe o motivo da devolução no comentário" });
      }
      const updated = await prisma.leaderGoalAnalysis.update({
        where: { id },
        data: {
          status: "returned",
          reviewComment: parsed.reviewComment,
          reviewedAt: new Date(),
        },
        include: ANALYSIS_INCLUDE,
      });
      await notifyInApp({
        userId: existing.authorUserId,
        organizationId: orgId,
        title: "Sua análise de metas foi devolvida",
        body: `Sua análise de metas para o ciclo ${existing.cycle?.name ?? ""} foi devolvida. Comentário: ${parsed.reviewComment}`,
        linkUrl: `/app/goals/analysis/${id}`,
      }).catch((e) => console.error("[goal-analyses] notify return", e));
      return res.json(await serialize(updated));
    }
  } catch (err) {
    badReq(res, err);
  }
});
