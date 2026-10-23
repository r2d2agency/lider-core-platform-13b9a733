import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import type { AppRole, Prisma } from "@prisma/client";
import { requireAuth } from "../auth.js";
import { notifyInApp } from "../lib/notifications.js";

/**
 * Metas da Corporação — Passo 1 (briefing do dono por ciclo).
 *
 * O dono/executivo escreve o briefing do ciclo (contexto, prioridades,
 * restrições e 3–5 metas). Ao publicar, os líderes passam a ver o
 * briefing; ao ratificar, ele vira oficial ("Meta da Corporação").
 *
 * Regra transversal "nada é excluído": toda edição grava uma entrada em
 * `revisions` com um snapshot do estado anterior — atualizar nunca
 * sobrescreve o histórico.
 */

export const corporateBriefingsRouter = Router();
corporateBriefingsRouter.use(requireAuth);

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

/** Quem escreve o briefing: dono/executivo (mesmo recorte do NR-1). */
const EXEC_ROLES: AppRole[] = ["hr_admin", "franchise_owner"];

async function isExec(userId: string, orgId: string) {
  if (await isSuper(userId)) return true;
  const m = await prisma.membership.findFirst({
    where: { userId, organizationId: orgId, role: { in: EXEC_ROLES } },
  });
  return !!m;
}

corporateBriefingsRouter.param("orgId", async (req, res, next, orgId) => {
  if (!(await assertOrgAccess(req.userId!, orgId))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

const goalSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().min(2, "Título da meta é obrigatório"),
  indicatorId: z.string().uuid().optional().nullable(),
  targetValue: z.number().optional().nullable(),
  currentValue: z.number().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
});

const briefingSchema = z.object({
  cycleId: z.string().uuid(),
  context: z.string().optional().nullable(),
  priorities: z.array(z.string()).default([]),
  constraints: z.array(z.string()).default([]),
  goals: z.array(goalSchema).max(5, "Máximo de 5 metas corporativas por ciclo").default([]),
  status: z.enum(["draft", "published"]).optional(),
});

const updateBriefingSchema = briefingSchema.omit({ cycleId: true }).partial().extend({
  note: z.string().optional().nullable(),
});

function revisionsOf(briefing: { revisions: Prisma.JsonValue }) {
  return Array.isArray(briefing.revisions) ? (briefing.revisions as Prisma.JsonArray) : [];
}

/** Nome legível para o histórico de revisões (perfil > e-mail > id). */
async function resolveNames(ids: Array<string | null | undefined>) {
  const unique = Array.from(new Set(ids.filter((id): id is string => !!id)));
  if (!unique.length) return {} as Record<string, string>;
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: { id: true, email: true, profile: { select: { fullName: true } } },
  });
  return Object.fromEntries(users.map((u) => [u.id, u.profile?.fullName ?? u.email]));
}

const BRIEFING_INCLUDE = {
  cycle: { select: { id: true, name: true, startAt: true, endAt: true, status: true } },
  goals: {
    orderBy: { orderIndex: "asc" },
    include: { indicator: { select: { id: true, name: true, unit: true, direction: true, target: true } } },
  },
} satisfies Prisma.CorporateGoalBriefingInclude;

/** Shape devolvido à UI, com nomes resolvidos do histórico. */
async function serialize(briefing: any) {
  const revisions = revisionsOf(briefing);
  const names = await resolveNames([
    briefing.createdBy,
    briefing.updatedBy,
    ...revisions.map((r) => (r && typeof r === "object" ? (r as any).by : null)),
  ]);
  return { ...briefing, revisions, userNames: names };
}

/** Ciclo padrão quando a UI não informa: ativo; senão o mais recente. */
async function defaultCycleId(orgId: string) {
  const active = await prisma.cycle.findFirst({
    where: { organizationId: orgId, status: "active" },
    orderBy: { startAt: "desc" },
    select: { id: true },
  });
  if (active) return active.id;
  const latest = await prisma.cycle.findFirst({
    where: { organizationId: orgId },
    orderBy: { endAt: "desc" },
    select: { id: true },
  });
  return latest?.id ?? null;
}

async function notifyLeaders(orgId: string, title: string, body: string) {
  const leaders = await prisma.membership.findMany({
    where: { organizationId: orgId, role: "leader" },
    select: { userId: true },
  });
  await Promise.all(
    leaders.map((l) =>
      notifyInApp({
        userId: l.userId,
        organizationId: orgId,
        title,
        body,
        linkUrl: "/app/goals/corporate",
      }).catch(() => null),
    ),
  );
}

// ============================================================
// Leitura — qualquer membro da organização
// ============================================================

corporateBriefingsRouter.get("/:orgId/corporate-briefings/current", async (req, res) => {
  const orgId = req.params.orgId;
  try {
    const requested = typeof req.query.cycleId === "string" ? req.query.cycleId : null;
    const cycleId = requested ?? (await defaultCycleId(orgId));

    const [cycles, briefing] = await Promise.all([
      prisma.cycle.findMany({
        where: { organizationId: orgId },
        orderBy: [{ status: "asc" }, { startAt: "desc" }],
        select: { id: true, name: true, startAt: true, endAt: true, status: true },
      }),
      cycleId
        ? prisma.corporateGoalBriefing.findUnique({
            where: { organizationId_cycleId: { organizationId: orgId, cycleId } },
            include: BRIEFING_INCLUDE,
          })
        : Promise.resolve(null),
    ]);

    res.json({
      cycleId,
      cycles,
      briefing: briefing ? await serialize(briefing) : null,
    });
  } catch (err) {
    console.error("[corporate-briefings] current", err);
    res.status(500).json({ error: "Falha ao carregar o briefing" });
  }
});

// Histórico de briefings da organização (todos os ciclos).
corporateBriefingsRouter.get("/:orgId/corporate-briefings", async (req, res) => {
  try {
    const briefings = await prisma.corporateGoalBriefing.findMany({
      where: { organizationId: req.params.orgId },
      orderBy: { createdAt: "desc" },
      include: BRIEFING_INCLUDE,
    });
    res.json(await Promise.all(briefings.map(serialize)));
  } catch (err) {
    console.error("[corporate-briefings] list", err);
    res.status(500).json({ error: "Falha ao listar os briefings" });
  }
});

// ============================================================
// Escrita — dono/executivo
// ============================================================

corporateBriefingsRouter.post("/:orgId/corporate-briefings", async (req, res) => {
  const orgId = req.params.orgId;
  if (!(await isExec(req.userId!, orgId)))
    return res.status(403).json({ error: "Apenas o dono/executivo publica o briefing" });
  try {
    const data = briefingSchema.parse(req.body);

    const cycle = await prisma.cycle.findFirst({
      where: { id: data.cycleId, organizationId: orgId },
      select: { id: true, name: true },
    });
    if (!cycle) return res.status(404).json({ error: "Ciclo não encontrado nesta organização" });

    const status = data.status ?? "draft";
    if (status !== "draft" && data.goals.length < 3)
      return res
        .status(400)
        .json({ error: "Publique o briefing com pelo menos 3 metas corporativas" });

    const briefing = await prisma.corporateGoalBriefing.create({
      data: {
        organizationId: orgId,
        cycleId: data.cycleId,
        context: data.context ?? null,
        priorities: data.priorities,
        constraints: data.constraints,
        status,
        createdBy: req.userId!,
        updatedBy: req.userId!,
        goals: {
          create: data.goals.map((g, i) => ({
            title: g.title,
            indicatorId: g.indicatorId ?? null,
            targetValue: g.targetValue ?? null,
            currentValue: g.currentValue ?? null,
            dueAt: g.dueAt ? new Date(g.dueAt) : null,
            orderIndex: i,
          })),
        },
      },
      include: BRIEFING_INCLUDE,
    });

    if (status === "published") {
      await notifyLeaders(
        orgId,
        "Metas da Corporação publicadas",
        `O briefing do ciclo ${cycle.name} está disponível. Veja as prioridades e alinhe as metas da sua equipe.`,
      );
    }

    res.status(201).json(await serialize(briefing));
  } catch (err: any) {
    if (err?.code === "P2002")
      return res.status(409).json({ error: "Já existe um briefing para este ciclo" });
    badReq(res, err);
  }
});

corporateBriefingsRouter.patch("/:orgId/corporate-briefings/:id", async (req, res) => {
  const orgId = req.params.orgId;
  if (!(await isExec(req.userId!, orgId)))
    return res.status(403).json({ error: "Apenas o dono/executivo edita o briefing" });
  try {
    const data = updateBriefingSchema.parse(req.body);

    const existing = await prisma.corporateGoalBriefing.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      include: { goals: { orderBy: { orderIndex: "asc" } } },
    });
    if (!existing) return res.status(404).json({ error: "Briefing não encontrado" });
    if (existing.status === "ratified")
      return res.status(400).json({
        error: "Briefing já ratificado é imutável — crie um novo briefing para o próximo ciclo",
      });

    const nextStatus = data.status ?? existing.status;
    if (nextStatus !== "draft") {
      const goalCount = data.goals ? data.goals.length : existing.goals.length;
      if (goalCount < 3)
        return res
          .status(400)
          .json({ error: "Publique o briefing com pelo menos 3 metas corporativas" });
    }

    // Snapshot do estado anterior: histórico nunca é sobrescrito.
    const snapshot = {
      context: existing.context,
      priorities: existing.priorities,
      constraints: existing.constraints,
      status: existing.status,
      goals: existing.goals.map((g) => ({
        id: g.id,
        title: g.title,
        indicatorId: g.indicatorId,
        targetValue: g.targetValue,
        currentValue: g.currentValue,
        dueAt: g.dueAt,
      })),
    };
    const revisions = [
      ...revisionsOf(existing),
      { at: new Date().toISOString(), by: req.userId!, note: data.note ?? null, snapshot },
    ] as unknown as Prisma.InputJsonValue;

    const briefing = await prisma.$transaction(async (tx) => {
      if (data.goals) {
        const keepIds = data.goals
          .map((g) => g.id)
          .filter((id): id is string => !!id);
        // Metas removidas do briefing ficam preservadas no snapshot acima.
        await tx.corporateGoal.deleteMany({
          where: { briefingId: existing.id, id: { notIn: keepIds.length ? keepIds : [""] } },
        });
        for (const [i, g] of data.goals.entries()) {
          const payload = {
            title: g.title,
            indicatorId: g.indicatorId ?? null,
            targetValue: g.targetValue ?? null,
            currentValue: g.currentValue ?? null,
            dueAt: g.dueAt ? new Date(g.dueAt) : null,
            orderIndex: i,
          };
          if (g.id)
            await tx.corporateGoal.updateMany({
              where: { id: g.id, briefingId: existing.id },
              data: payload,
            });
          else
            await tx.corporateGoal.create({
              data: { ...payload, briefingId: existing.id },
            });
        }
      }

      return tx.corporateGoalBriefing.update({
        where: { id: existing.id },
        data: {
          ...(data.context !== undefined ? { context: data.context ?? null } : {}),
          ...(data.priorities !== undefined ? { priorities: data.priorities } : {}),
          ...(data.constraints !== undefined ? { constraints: data.constraints } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          revisions,
          updatedBy: req.userId!,
        },
        include: BRIEFING_INCLUDE,
      });
    });

    if (existing.status !== "published" && nextStatus === "published") {
      await notifyLeaders(
        orgId,
        "Metas da Corporação publicadas",
        `O briefing do ciclo ${briefing.cycle?.name ?? ""} foi atualizado. Reveja as prioridades e alinhe as metas da sua equipe.`,
      );
    }

    res.json(await serialize(briefing));
  } catch (err) {
    badReq(res, err);
  }
});

corporateBriefingsRouter.post("/:orgId/corporate-briefings/:id/ratify", async (req, res) => {
  const orgId = req.params.orgId;
  if (!(await isExec(req.userId!, orgId)))
    return res.status(403).json({ error: "Apenas o dono/executivo ratifica o briefing" });
  try {
    const briefing = await prisma.corporateGoalBriefing.findFirst({
      where: { id: req.params.id, organizationId: orgId },
      include: BRIEFING_INCLUDE,
    });
    if (!briefing) return res.status(404).json({ error: "Briefing não encontrado" });
    if (briefing.status === "ratified") return res.status(400).json({ error: "Briefing já ratificado" });
    if (briefing.status !== "published")
      return res.status(400).json({ error: "Publique o briefing antes de ratificar" });

    const updated = await prisma.corporateGoalBriefing.update({
      where: { id: briefing.id },
      data: { status: "ratified", updatedBy: req.userId! },
      include: BRIEFING_INCLUDE,
    });

    await notifyLeaders(
      orgId,
      "Metas da Corporação oficializadas",
      `O briefing do ciclo ${briefing.cycle?.name ?? ""} foi ratificado. As metas corporativas agora são oficiais.`,
    );

    res.json(await serialize(updated));
  } catch (err) {
    badReq(res, err);
  }
});
