import { Router, type Response } from "express";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";
import { completeChat } from "../lib/ai-gateway.js";

/**
 * Metas da Corporação — Passo 2 (confronto + IA).
 *
 * Endpoint somente leitura que cruza as metas corporativas do briefing
 * do ciclo com as metas de ciclo (CycleGoal) e devolve uma análise de
 * alinhamento: pareamentos sugeridos, metas "órfãs" (de ciclo que não
 * atendem nenhuma meta corporativa) e "descobertas" (meta corporativa
 * sem nenhuma meta de ciclo atendendo), além de sugestões de ação.
 */

export const goalAlignmentRouter = Router();
goalAlignmentRouter.use(requireAuth);

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

goalAlignmentRouter.param("orgId", async (req, res, next, orgId) => {
  if (!(await assertOrgAccess(req.userId!, orgId))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

goalAlignmentRouter.get("/:orgId/goal-alignment", async (req, res) => {
  const orgId = req.params.orgId;
  try {
    const cycleId = typeof req.query.cycleId === "string" ? req.query.cycleId : null;
    if (!cycleId) return res.status(400).json({ error: "cycleId é obrigatório" });

    const [briefing, cycle, cycleGoalsRaw] = await Promise.all([
      prisma.corporateGoalBriefing.findUnique({
        where: { organizationId_cycleId: { organizationId: orgId, cycleId } },
        include: {
          goals: { orderBy: { orderIndex: "asc" }, include: { indicator: true } },
        },
      }),
      prisma.cycle.findFirst({ where: { id: cycleId, organizationId: orgId } }),
      prisma.cycleGoal.findMany({
        where: { cycle: { id: cycleId, organizationId: orgId } },
      }),
    ]);
    if (!cycle) return res.status(404).json({ error: "Ciclo não encontrado" });

    // Indicadores referenciados pelas metas de ciclo.
    const indicatorIds = Array.from(new Set(cycleGoalsRaw.map((g) => g.indicatorId).filter((x): x is string => !!x)));
    const indicators = indicatorIds.length
      ? await prisma.indicator.findMany({ where: { id: { in: indicatorIds } } })
      : [];
    const indMap = new Map(indicators.map((i) => [i.id, i]));
    const ownerIds = Array.from(new Set(cycleGoalsRaw.map((g) => g.ownerUserId).filter((x): x is string => !!x)));
    const owners = ownerIds.length
      ? await prisma.user.findMany({ where: { id: { in: ownerIds } }, select: { id: true, profile: { select: { fullName: true } } } })
      : [];
    const ownerMap = new Map(owners.map((u) => [u.id, u.profile?.fullName ?? null]));
    const cycleGoals = cycleGoalsRaw.map((g) => ({ ...g, indicator: g.indicatorId ? indMap.get(g.indicatorId) ?? null : null, ownerName: g.ownerUserId ? ownerMap.get(g.ownerUserId) ?? null : null }));

    const corporateGoals = briefing?.goals ?? [];
    // Pareamento determinístico: mesma indicador (ou título contém).
    const pairs: Array<{ corporateGoalId: string; cycleGoalId: string; reason: string }> = [];
    for (const cg of corporateGoals) {
      for (const lg of cycleGoals) {
        if (cg.indicatorId && lg.indicatorId && cg.indicatorId === lg.indicatorId) {
          pairs.push({ corporateGoalId: cg.id, cycleGoalId: lg.id, reason: "mesmo indicador" });
        } else if (!cg.indicatorId && !lg.indicatorId && lg.title.toLowerCase().includes(cg.title.toLowerCase().slice(0, 12))) {
          pairs.push({ corporateGoalId: cg.id, cycleGoalId: lg.id, reason: "título semelhante" });
        }
      }
    }
    const pairedCycleIds = new Set(pairs.map((p) => p.cycleGoalId));
    const pairedCorpIds = new Set(pairs.map((p) => p.corporateGoalId));
    const orphans = cycleGoals.filter((g) => !pairedCycleIds.has(g.id)).map((g) => ({ id: g.id, title: g.title }));
    const discoveries = corporateGoals.filter((g) => !pairedCorpIds.has(g.id)).map((g) => ({ id: g.id, title: g.title }));

    // IA: sugestões textuais (não-bloqueante).
    let aiSuggestions: { pairs: Array<{ corporateGoalId: string; cycleGoalId: string; why: string }>; orphanAdvice: string[]; gapAdvice: string[] } | null = null;
    try {
      const raw = await completeChat({
        messages: [
          {
            role: "system",
            content:
              "Você é um consultor de alinhamento estratégico. Cruze metas corporativas com metas de ciclo. " +
              "Responda APENAS JSON válido sem markdown no formato: " +
              '{"pairs":[{"corporateGoalId":"","cycleGoalId":"","why":""}],"orphanAdvice":[""],"gapAdvice":[""]}',
          },
          {
            role: "user",
            content: JSON.stringify({
              corporateGoals: corporateGoals.map((g) => ({ id: g.id, title: g.title, indicator: g.indicator?.name ?? null, target: g.targetValue })),
              cycleGoals: cycleGoals.map((g) => ({ id: g.id, title: g.title, indicator: g.indicator?.name ?? null, target: g.targetValue })),
              deterministicPairs: pairs,
            }),
          },
        ],
      });
      const match = String(raw).match(/\{[\s\S]*\}/);
      if (match) aiSuggestions = JSON.parse(match[0]);
    } catch (e) {
      console.error("[goal-alignment] IA falhou", e);
    }

    res.json({
      cycle: { id: cycle.id, name: cycle.name, startAt: cycle.startAt, endAt: cycle.endAt, status: cycle.status },
      briefingStatus: briefing?.status ?? null,
      corporateGoals: corporateGoals.map((g) => ({ id: g.id, title: g.title, indicatorId: g.indicatorId, indicator: g.indicator ? { id: g.indicator.id, name: g.indicator.name, unit: g.indicator.unit } : null, targetValue: g.targetValue, currentValue: g.currentValue, dueAt: g.dueAt })),
      cycleGoals: cycleGoals.map((g) => ({ id: g.id, title: g.title, indicatorId: g.indicatorId, indicator: g.indicator ? { id: g.indicator.id, name: g.indicator.name, unit: g.indicator.unit } : null, targetValue: g.targetValue, currentValue: g.currentValue, dueAt: g.dueAt, ownerUserId: g.ownerUserId, ownerName: (g as any).ownerName ?? null, status: g.status })),
      pairs,
      orphans,
      discoveries,
      ai: aiSuggestions,
    });
  } catch (err) {
    console.error("[goal-alignment]", err);
    badReq(res, err);
  }
});
