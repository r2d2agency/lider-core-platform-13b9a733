import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";

/**
 * Ciclos com metas SMART (Fase 1 · item 5).
 * Trimestre / semestre / campanha com metas ligadas a indicadores existentes.
 */
export const cyclesRouter = Router();
cyclesRouter.use(requireAuth);

function badReq(res: Response, err: unknown) {
  return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
}

async function assertOrgAccess(userId: string, orgId: string) {
  const su = await prisma.userRole.findFirst({
    where: { userId, role: { in: ["super_admin", "neo_admin"] } },
  });
  if (su) return true;
  const m = await prisma.membership.findFirst({ where: { userId, organizationId: orgId } });
  return !!m;
}

cyclesRouter.param("orgId", async (req, res, next, orgId) => {
  if (!(await assertOrgAccess(req.userId!, orgId))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

cyclesRouter.get("/:orgId/cycles", async (req, res) => {
  const cycles = await prisma.cycle.findMany({
    where: { organizationId: req.params.orgId },
    orderBy: [{ status: "asc" }, { startAt: "desc" }],
    include: { goals: true },
  });
  res.json(cycles);
});

// Plano de ação pendente entre todas as metas ativas — usado no painel
// executivo do Módulo E (Evolução).
cyclesRouter.get("/:orgId/action-items/pending", async (req, res) => {
  const items = await prisma.cycleGoalActionItem.findMany({
    where: {
      status: { not: "done" },
      goal: { cycle: { organizationId: req.params.orgId, status: "active" } },
    },
    include: { goal: { select: { id: true, title: true, dueAt: true, status: true } } },
    orderBy: [{ dueAt: "asc" }],
    take: 30,
  });
  res.json(items);
});

const cycleSchema = z.object({
  name: z.string().min(2),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  status: z.enum(["planning", "active", "closed"]).default("planning"),
  summary: z.string().optional().nullable(),
});

cyclesRouter.post("/:orgId/cycles", async (req, res) => {
  try {
    const data = cycleSchema.parse(req.body);
    const c = await prisma.cycle.create({
      data: {
        organizationId: req.params.orgId,
        name: data.name,
        startAt: new Date(data.startAt),
        endAt: new Date(data.endAt),
        status: data.status,
        summary: data.summary ?? null,
        createdBy: req.userId!,
      },
    });
    res.status(201).json(c);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.patch("/:orgId/cycles/:id", async (req, res) => {
  try {
    const data = cycleSchema.partial().parse(req.body);
    const c = await prisma.cycle.update({
      where: { id: req.params.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.startAt !== undefined ? { startAt: new Date(data.startAt) } : {}),
        ...(data.endAt !== undefined ? { endAt: new Date(data.endAt) } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.summary !== undefined ? { summary: data.summary ?? null } : {}),
      },
    });
    res.json(c);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.delete("/:orgId/cycles/:id", async (req, res) => {
  await prisma.cycle.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});

const goalSchema = z.object({
  title: z.string().min(2),
  specific: z.string().optional().nullable(),
  measurable: z.string().optional().nullable(),
  achievable: z.string().optional().nullable(),
  relevant: z.string().optional().nullable(),
  timeBound: z.string().optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
  areaId: z.string().uuid().optional().nullable(),
  indicatorId: z.string().uuid().optional().nullable(),
  targetValue: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  neededIndicatorIds: z.array(z.string().uuid()).optional(),
  status: z.enum(["on_track", "at_risk", "off_track", "done", "dropped"]).optional(),
});

cyclesRouter.post("/:orgId/cycles/:cycleId/goals", async (req, res) => {
  try {
    const data = goalSchema.parse(req.body);
    const g = await prisma.cycleGoal.create({
      data: {
        cycleId: req.params.cycleId,
        title: data.title,
        specific: data.specific ?? null,
        measurable: data.measurable ?? null,
        achievable: data.achievable ?? null,
        relevant: data.relevant ?? null,
        timeBound: data.timeBound ?? null,
        ownerUserId: data.ownerUserId ?? null,
        areaId: data.areaId ?? null,
        indicatorId: data.indicatorId ?? null,
        targetValue: data.targetValue ?? null,
        currentValue: data.currentValue ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        neededIndicatorIds: data.neededIndicatorIds ?? [],
        status: data.status ?? "on_track",
      },
    });
    res.status(201).json(g);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.get("/:orgId/cycles/:cycleId/goals/:goalId", async (req, res) => {
  const g = await prisma.cycleGoal.findFirst({
    where: { id: req.params.goalId, cycleId: req.params.cycleId },
    include: {
      actionItems: { orderBy: { createdAt: "asc" } },
      breakdowns: { orderBy: { createdAt: "asc" } },
      teamReadiness: { orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }] },
      cultureChecks: { orderBy: { createdAt: "desc" } },
      reflections: true,
    },
  });
  if (!g) return res.status(404).json({ error: "Meta não encontrada" });
  res.json(g);
});

cyclesRouter.patch("/:orgId/cycles/:cycleId/goals/:goalId", async (req, res) => {
  try {
    const data = goalSchema.partial().parse(req.body);
    const g = await prisma.cycleGoal.update({
      where: { id: req.params.goalId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.specific !== undefined ? { specific: data.specific ?? null } : {}),
        ...(data.measurable !== undefined ? { measurable: data.measurable ?? null } : {}),
        ...(data.achievable !== undefined ? { achievable: data.achievable ?? null } : {}),
        ...(data.relevant !== undefined ? { relevant: data.relevant ?? null } : {}),
        ...(data.timeBound !== undefined ? { timeBound: data.timeBound ?? null } : {}),
        ...(data.ownerUserId !== undefined ? { ownerUserId: data.ownerUserId ?? null } : {}),
        ...(data.areaId !== undefined ? { areaId: data.areaId ?? null } : {}),
        ...(data.indicatorId !== undefined ? { indicatorId: data.indicatorId ?? null } : {}),
        ...(data.targetValue !== undefined ? { targetValue: data.targetValue ?? null } : {}),
        ...(data.currentValue !== undefined ? { currentValue: data.currentValue ?? null } : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt ? new Date(data.dueAt) : null } : {}),
        ...(data.neededIndicatorIds !== undefined
          ? { neededIndicatorIds: data.neededIndicatorIds }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });
    res.json(g);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.delete("/:orgId/cycles/:cycleId/goals/:goalId", async (req, res) => {
  await prisma.cycleGoal.delete({ where: { id: req.params.goalId } }).catch(() => null);
  res.status(204).end();
});

// ============================================================
// Plano de ação da meta ("Bater metas")
// ============================================================
const actionItemSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  status: z.enum(["pending", "in_progress", "done"]).optional(),
});

cyclesRouter.post("/:orgId/cycles/:cycleId/goals/:goalId/actions", async (req, res) => {
  try {
    const data = actionItemSchema.parse(req.body);
    const item = await prisma.cycleGoalActionItem.create({
      data: {
        goalId: req.params.goalId,
        title: data.title,
        description: data.description ?? null,
        ownerUserId: data.ownerUserId ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        status: data.status ?? "pending",
      },
    });
    res.status(201).json(item);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.patch("/:orgId/cycles/:cycleId/goals/:goalId/actions/:id", async (req, res) => {
  try {
    const data = actionItemSchema.partial().parse(req.body);
    const item = await prisma.cycleGoalActionItem.update({
      where: { id: req.params.id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description ?? null } : {}),
        ...(data.ownerUserId !== undefined ? { ownerUserId: data.ownerUserId ?? null } : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt ? new Date(data.dueAt) : null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });
    res.json(item);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.delete("/:orgId/cycles/:cycleId/goals/:goalId/actions/:id", async (req, res) => {
  await prisma.cycleGoalActionItem.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});

// ============================================================
// Desdobramento da meta por colaborador
// ============================================================
const breakdownSchema = z.object({
  memberUserId: z.string().uuid().optional().nullable(),
  memberLabel: z.string().optional().nullable(),
  title: z.string().min(2),
  indicatorId: z.string().uuid().optional().nullable(),
  targetValue: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  status: z.enum(["on_track", "at_risk", "off_track", "done", "dropped"]).optional(),
});

cyclesRouter.post("/:orgId/cycles/:cycleId/goals/:goalId/breakdowns", async (req, res) => {
  try {
    const data = breakdownSchema.parse(req.body);
    const item = await prisma.cycleGoalBreakdown.create({
      data: {
        goalId: req.params.goalId,
        memberUserId: data.memberUserId ?? null,
        memberLabel: data.memberLabel ?? null,
        title: data.title,
        indicatorId: data.indicatorId ?? null,
        targetValue: data.targetValue ?? null,
        currentValue: data.currentValue ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        status: data.status ?? "on_track",
      },
    });
    res.status(201).json(item);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.patch("/:orgId/cycles/:cycleId/goals/:goalId/breakdowns/:id", async (req, res) => {
  try {
    const data = breakdownSchema.partial().parse(req.body);
    const item = await prisma.cycleGoalBreakdown.update({
      where: { id: req.params.id },
      data: {
        ...(data.memberUserId !== undefined ? { memberUserId: data.memberUserId ?? null } : {}),
        ...(data.memberLabel !== undefined ? { memberLabel: data.memberLabel ?? null } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.indicatorId !== undefined ? { indicatorId: data.indicatorId ?? null } : {}),
        ...(data.targetValue !== undefined ? { targetValue: data.targetValue ?? null } : {}),
        ...(data.currentValue !== undefined ? { currentValue: data.currentValue ?? null } : {}),
        ...(data.dueAt !== undefined ? { dueAt: data.dueAt ? new Date(data.dueAt) : null } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      },
    });
    res.json(item);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.delete("/:orgId/cycles/:cycleId/goals/:goalId/breakdowns/:id", async (req, res) => {
  await prisma.cycleGoalBreakdown.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});

// ============================================================
// "Com o time" — preparo da equipe para a meta (mensal)
// ============================================================
const TEAM_READINESS_ACTIONS = [
  "recrutar",
  "treinar",
  "inspirar_engajar",
  "desenvolver",
  "coaching",
  "meritocracia",
  "zona_conforto",
  "reorganizar",
] as const;

const teamReadinessSchema = z.object({
  periodYear: z.number().int(),
  periodMonth: z.number().int().min(1).max(12),
  actions: z.array(z.enum(TEAM_READINESS_ACTIONS)).optional(),
  monthlyPlan: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

cyclesRouter.post("/:orgId/cycles/:cycleId/goals/:goalId/team-readiness", async (req, res) => {
  try {
    const data = teamReadinessSchema.parse(req.body);
    const item = await prisma.cycleGoalTeamReadiness.upsert({
      where: {
        goalId_periodYear_periodMonth: {
          goalId: req.params.goalId,
          periodYear: data.periodYear,
          periodMonth: data.periodMonth,
        },
      },
      create: {
        goalId: req.params.goalId,
        periodYear: data.periodYear,
        periodMonth: data.periodMonth,
        actions: data.actions ?? [],
        monthlyPlan: data.monthlyPlan ?? null,
        notes: data.notes ?? null,
        createdBy: req.userId!,
      },
      update: {
        actions: data.actions ?? [],
        monthlyPlan: data.monthlyPlan ?? null,
        notes: data.notes ?? null,
      },
    });
    res.status(201).json(item);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.delete(
  "/:orgId/cycles/:cycleId/goals/:goalId/team-readiness/:id",
  async (req, res) => {
    await prisma.cycleGoalTeamReadiness.delete({ where: { id: req.params.id } }).catch(() => null);
    res.status(204).end();
  },
);

// ============================================================
// "Fazendo certo" — coerência cultural da equipe
// ============================================================
const cultureCheckSchema = z.object({
  practicesCulture: z.number().int().min(1).max(5).optional().nullable(),
  highPerformanceOrientation: z.number().int().min(1).max(5).optional().nullable(),
  factBasedDecisions: z.number().int().min(1).max(5).optional().nullable(),
  intellectualHonesty: z.number().int().min(1).max(5).optional().nullable(),
  behaviorsAlignment: z.number().int().min(1).max(5).optional().nullable(),
  notes: z.string().optional().nullable(),
});

cyclesRouter.post("/:orgId/cycles/:cycleId/goals/:goalId/culture-checks", async (req, res) => {
  try {
    const data = cultureCheckSchema.parse(req.body);
    const item = await prisma.cycleGoalCultureCheck.create({
      data: {
        goalId: req.params.goalId,
        practicesCulture: data.practicesCulture ?? null,
        highPerformanceOrientation: data.highPerformanceOrientation ?? null,
        factBasedDecisions: data.factBasedDecisions ?? null,
        intellectualHonesty: data.intellectualHonesty ?? null,
        behaviorsAlignment: data.behaviorsAlignment ?? null,
        notes: data.notes ?? null,
        createdBy: req.userId!,
      },
    });
    res.status(201).json(item);
  } catch (err) {
    badReq(res, err);
  }
});

// ============================================================
// Perguntas de apoio — reflexão do líder sobre a meta
// ============================================================
const reflectionSchema = z.object({
  promptKey: z.string().min(1),
  answer: z.string(),
});

cyclesRouter.post("/:orgId/cycles/:cycleId/goals/:goalId/reflections", async (req, res) => {
  try {
    const data = reflectionSchema.parse(req.body);
    const item = await prisma.cycleGoalReflection.upsert({
      where: { goalId_promptKey: { goalId: req.params.goalId, promptKey: data.promptKey } },
      create: { goalId: req.params.goalId, promptKey: data.promptKey, answer: data.answer },
      update: { answer: data.answer },
    });
    res.status(201).json(item);
  } catch (err) {
    badReq(res, err);
  }
});

// ============================================================
// Retrospectivas (Fase 2 · item 4)
// ============================================================
const retroSchema = z.object({
  areaId: z.string().uuid().optional().nullable(),
  wentWell: z.string().optional().nullable(),
  toImprove: z.string().optional().nullable(),
  learnings: z.string().optional().nullable(),
  nextSteps: z.string().optional().nullable(),
  confidence: z.number().int().min(0).max(10).optional().nullable(),
});

cyclesRouter.get("/:orgId/cycles/:cycleId/retrospectives", async (req, res) => {
  const rows = await prisma.cycleRetrospective.findMany({
    where: { cycleId: req.params.cycleId, organizationId: req.params.orgId },
    orderBy: { createdAt: "desc" },
  });
  res.json(rows);
});

cyclesRouter.post("/:orgId/cycles/:cycleId/retrospectives", async (req, res) => {
  try {
    const data = retroSchema.parse(req.body);
    const created = await prisma.cycleRetrospective.create({
      data: {
        cycleId: req.params.cycleId,
        organizationId: req.params.orgId,
        areaId: data.areaId ?? null,
        wentWell: data.wentWell ?? null,
        toImprove: data.toImprove ?? null,
        learnings: data.learnings ?? null,
        nextSteps: data.nextSteps ?? null,
        confidence: data.confidence ?? null,
        createdBy: req.userId!,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.patch("/:orgId/cycles/:cycleId/retrospectives/:id", async (req, res) => {
  try {
    const data = retroSchema.partial().parse(req.body);
    const updated = await prisma.cycleRetrospective.update({
      where: { id: req.params.id },
      data: {
        ...(data.areaId !== undefined ? { areaId: data.areaId ?? null } : {}),
        ...(data.wentWell !== undefined ? { wentWell: data.wentWell ?? null } : {}),
        ...(data.toImprove !== undefined ? { toImprove: data.toImprove ?? null } : {}),
        ...(data.learnings !== undefined ? { learnings: data.learnings ?? null } : {}),
        ...(data.nextSteps !== undefined ? { nextSteps: data.nextSteps ?? null } : {}),
        ...(data.confidence !== undefined ? { confidence: data.confidence ?? null } : {}),
      },
    });
    res.json(updated);
  } catch (err) {
    badReq(res, err);
  }
});

cyclesRouter.delete("/:orgId/cycles/:cycleId/retrospectives/:id", async (req, res) => {
  await prisma.cycleRetrospective.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});
