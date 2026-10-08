import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";
import { resolveOrgContext } from "../lib/org-access.js";

/**
 * Rotas do "eu logado" — dados agregados para a Home (Briefing do dia),
 * jornada inicial (onboarding pós mentoria Neo) e importação do CORE DNA.
 *
 * O app do líder deve ser DESACOPLADO da metodologia: essas rotas leem
 * jornadas/assessments criados pelo admin Neo e devolvem o mínimo que a Home
 * precisa exibir.
 */
export const meRouter = Router();
meRouter.use(requireAuth);

// GET /me/home/briefing
// Devolve o "o que precisa da minha atenção hoje?".
meRouter.get("/home/briefing", async (req, res) => {
  const userId = req.userId!;
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfWeek = new Date(startOfDay);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  const [profile, notifications, dna] = await Promise.all([
    prisma.profile.findUnique({
      where: { id: userId },
      select: {
        fullName: true,
        onboardingCompletedAt: true,
        onboardingSteps: true,
        didNeoMentorship: true,
      },
    }),
    prisma.notificationLog
      .findMany({
        where: { userId, channel: "in_app", readAt: null },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, title: true, body: true, linkUrl: true, createdAt: true },
      })
      .catch(() => []),
    prisma.leaderDNA
      .findUnique({ where: { userId }, select: { scores: true, strengths: true, improvements: true, updatedAt: true } })
      .catch(() => null),
  ]);

  // Próxima jornada inicial disponível (usada no onboarding pós-mentoria)
  const initialJourney = await prisma.journey
    .findFirst({
      where: { isInitial: true, status: "active" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, slug: true, name: true, description: true },
    })
    .catch(() => null);

  res.json({
    generatedAt: new Date().toISOString(),
    greeting: buildGreeting(profile?.fullName ?? null),
    profile: {
      fullName: profile?.fullName ?? null,
      onboardingCompletedAt: profile?.onboardingCompletedAt ?? null,
      didNeoMentorship: profile?.didNeoMentorship ?? false,
    },
    dna: dna ?? null,
    initialJourney,
    notifications: notifications.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      linkUrl: n.linkUrl,
      createdAt: n.createdAt,
    })),
    windows: {
      today: startOfDay.toISOString(),
      weekEnd: endOfWeek.toISOString(),
    },
  });
});

function buildGreeting(name: string | null): string {
  const first = (name ?? "").trim().split(" ")[0];
  return first ? `Olá, ${first}` : "Olá";
}

// ============================================================
// GET /me/home/attention — "Quem precisa da sua atenção"
// Agrega fatos reais do sistema: liderados sem 1:1, feedbacks pendentes,
// delegações atrasadas e próximos rituais. Mais o CORE Score atual.
// ============================================================
type AttentionItem = {
  id: string;
  title: string;
  reason: string;
  severity: "high" | "medium" | "low";
  kind: "one_on_one" | "feedback" | "delegation" | "ritual" | "onboarding" | "pdi" | "nr1";
  link: string | null;
};

const DAY = 86_400_000;

meRouter.get("/home/attention", async (req, res) => {
  const userId = req.userId!;
  const now = new Date();
  try {
    const requestedOrgId = typeof req.query.orgId === "string" ? req.query.orgId : null;
    const orgId = await resolveOrgContext(userId, requestedOrgId);
    if (requestedOrgId && !orgId) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!orgId) {
      return res.json({ generatedAt: now.toISOString(), items: [], total: 0, coreScore: null });
    }

    const recentOneOnOneSince = new Date(now.getTime() - 30 * DAY);
    const upcomingWindowEnd = new Date(now.getTime() + 14 * DAY);

    const [profile, myMembership, pdis, snapshots, snapshot, directReports, coachedSubjects] = await Promise.all([
      prisma.profile.findUnique({
        where: { id: userId },
        select: { onboardingSteps: true, onboardingCompletedAt: true }
      }),
      prisma.membership.findFirst({
        where: { userId, organizationId: orgId },
        select: { id: true },
      }),
      prisma.pdi.findMany({
        where: {
          organizationId: orgId,
          OR: [{ subjectUserId: userId }, { authorId: userId }],
        },
        select: { id: true, status: true },
      }),
      prisma.pdiSnapshot.findMany({
        where: { organizationId: orgId, subjectUserId: userId },
        select: { id: true, radarSnapshot: true },
        orderBy: { version: "desc" },
        take: 2
      }),
      prisma.leadershipScoreSnapshot.findFirst({
        where: { organizationId: orgId, userId },
        orderBy: [{ periodYear: "desc" }, { periodMonth: "desc" }],
        select: { score: true }
      }),
      prisma.membership.findMany({
        where: { organizationId: orgId, directLeaderId: userId },
        include: { user: { include: { profile: true } } },
        take: 50
      }),
      prisma.oneOnOne.findMany({
        where: { organizationId: orgId, leaderId: userId },
        distinct: ["subjectUserId"],
        select: { subjectUserId: true },
        take: 50,
      })
    ]);

    const upcomingOccurrences = await prisma.ritualOccurrence.findMany({
      where: {
        ritual: {
          organizationId: orgId,
          OR: [
            { ownerId: userId },
            ...(myMembership ? [{ participants: { some: { membershipId: myMembership.id } } }] : []),
          ],
        },
        scheduledAt: { gte: now },
        status: { in: ["scheduled", "in_progress"] }
      },
      take: 5
    });

    const items: AttentionItem[] = [];

    const reportIds = new Set<string>(directReports.map((m) => m.userId));
    for (const row of coachedSubjects) {
      if (row.subjectUserId && row.subjectUserId !== userId) reportIds.add(row.subjectUserId);
    }

    const reportMemberships =
      directReports.length > 0 && directReports.length === reportIds.size
        ? directReports
        : reportIds.size === 0
          ? []
          : await prisma.membership.findMany({
              where: { organizationId: orgId, userId: { in: [...reportIds] } },
              include: { user: { include: { profile: true } } },
              take: 50,
            });

    const recentOneOnOnes = reportIds.size === 0
      ? []
      : await prisma.oneOnOne.findMany({
          where: {
            organizationId: orgId,
            leaderId: userId,
            subjectUserId: { in: [...reportIds] },
            status: { not: "canceled" },
            scheduledAt: { gte: recentOneOnOneSince },
          },
          orderBy: { scheduledAt: "desc" },
          select: { subjectUserId: true, scheduledAt: true, status: true },
        });

    const latestBySubject = new Map<string, (typeof recentOneOnOnes)[number]>();
    for (const row of recentOneOnOnes) {
      if (!latestBySubject.has(row.subjectUserId)) latestBySubject.set(row.subjectUserId, row);
    }

    // 1. Status do Perfil/Onboarding
    if (!profile?.onboardingCompletedAt) {
      const steps = profile?.onboardingSteps && typeof profile.onboardingSteps === "object"
        ? Object.keys(profile.onboardingSteps as Record<string, unknown>)
        : [];
      const totalSteps = 4;
      const pct = Math.round((steps.length / totalSteps) * 100);
      items.push({
        id: "profile-incomplete",
        title: "Meu Perfil",
        reason: `Perfil incompleto — ${pct}% (Limitadores pendentes)`,
        severity: "high",
        kind: "onboarding",
        link: "/app/profile"
      });
    }

    // 2. Status do PDI pessoal (consolidado via PdiSnapshot na Jornada CORE)
    const lastSnapshot = snapshots?.[0];
    const prevSnapshot = snapshots?.[1];
    
    const activePdis = pdis.filter((p) => p.status === "ativo").length;
    const concludedPdis = pdis.filter((p) => p.status === "concluido").length;

    if (pdis.length === 0) {
      items.push({
        id: "pdi-none",
        title: "Meu PDI",
        reason: "PDI não iniciado",
        severity: "high",
        kind: "pdi",
        link: "/app/consciencia/pdi"
      });
    } else if (activePdis === 0 && concludedPdis > 0) {
      items.push({
        id: "pdi-ready-next",
        title: "Próximo ciclo de evolução",
        reason: `Você concluiu ${concludedPdis} ciclo(s). Já pode gerar um novo PDI.`,
        severity: "low",
        kind: "pdi",
        link: "/app/consciencia/pdi",
      });
    } else if (lastSnapshot && prevSnapshot && lastSnapshot.radarSnapshot && prevSnapshot.radarSnapshot) {
      const cur = lastSnapshot.radarSnapshot as any;
      const old = prevSnapshot.radarSnapshot as any;
      const curTotal = (cur.hard || 0) + (cur.soft || 0) + (cur.heart || 0);
      const oldTotal = (old.hard || 0) + (old.soft || 0) + (old.heart || 0);
      const diff = curTotal - oldTotal;

      if (diff > 0) {
        items.push({
          id: "pdi-evolution",
          title: "Evolução Positiva",
          reason: `Seu Radar de Autogestão subiu ${diff} pontos no último ciclo!`,
          severity: "low",
          kind: "pdi",
          link: "/app/consciencia/pdi"
        });
      }
    }

    // 3. Agenda/Rituais
    if (upcomingOccurrences.length === 0) {
      items.push({
        id: "agenda-empty",
        title: "Agenda",
        reason: "Agenda sem rituais",
        severity: "medium",
        kind: "ritual",
        link: "/app/consciencia/agenda"
      });
    }

    // 4. Liderados (baseado em 1:1 real)
    for (const member of reportMemberships) {
      const name = member.user?.profile?.fullName || member.user?.email || "Liderado";
      const latest = latestBySubject.get(member.userId);
      if (latest?.scheduledAt && latest.scheduledAt <= upcomingWindowEnd) continue;
      items.push({
        id: `member-${member.id}`,
        title: name,
        reason: latest
          ? `Sem 1:1 futuro agendado desde ${latest.scheduledAt.toLocaleDateString("pt-BR")}`
          : "Sem 1:1 registrado nos últimos 30 dias",
        severity: "medium",
        kind: "one_on_one",
        link: "/app/one-on-ones"
      });
    }

    // 5. NR-1 — Ações de riscos psicossociais
    const overdueActions = await prisma.nR1Action.findMany({
      where: {
        organizationId: orgId,
        dueDate: { lt: now },
        status: { notIn: ["completed", "cancelled"] },
      },
      select: { id: true, situation: true, dueDate: true, responsibleLabel: true },
      take: 3,
    });
    for (const a of overdueActions) {
      items.push({
        id: `nr1-action-${a.id}`,
        title: a.situation,
        reason: `Ação NR-1 atrasada desde ${a.dueDate!.toLocaleDateString("pt-BR")}${a.responsibleLabel ? ` · Resp: ${a.responsibleLabel}` : ""}`,
        severity: "high",
        kind: "nr1",
        link: "/app/nr1",
      });
    }

    const upcomingChecks = await prisma.nR1Action.findMany({
      where: {
        organizationId: orgId,
        status: "completed",
        nextCheckAt: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
      },
      select: { id: true, situation: true, nextCheckAt: true },
      take: 2,
    });
    for (const a of upcomingChecks) {
      items.push({
        id: `nr1-check-${a.id}`,
        title: a.situation,
        reason: `Verificação NR-1 agendada para ${a.nextCheckAt!.toLocaleDateString("pt-BR")}`,
        severity: "medium",
        kind: "nr1",
        link: "/app/nr1",
      });
    }

    res.json({
      generatedAt: now.toISOString(),
      items: items.slice(0, 6),
      total: items.length,
      coreScore: snapshot?.score ?? null,
    });
  } catch (err) {
    console.error("[me] attention error", err);
    res.json({ generatedAt: now.toISOString(), items: [], total: 0, coreScore: null });
  }
});

// GET /me/dna — CORE DNA do usuário logado
meRouter.get("/dna", async (req, res) => {
  const dna = await prisma.leaderDNA.findUnique({ where: { userId: req.userId! } });
  res.json({ dna });
});

// POST /me/dna/import — importa DNA já gerado (usuários que fizeram a mentoria Neo)
const importSchema = z.object({
  scores: z.record(z.number()).optional(),
  strengths: z.array(z.string()).optional(),
  improvements: z.array(z.string()).optional(),
  behavioral: z.record(z.unknown()).optional(),
  emotional: z.record(z.unknown()).optional(),
  technical: z.record(z.unknown()).optional(),
  communication: z.record(z.unknown()).optional(),
  source: z.string().optional(),
});

meRouter.post("/dna/import", async (req, res) => {
  const parsed = importSchema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const dna = await prisma.leaderDNA.upsert({
    where: { userId: req.userId! },
    update: {
      scores: (d.scores ?? undefined) as never,
      strengths: d.strengths ?? undefined,
      improvements: d.improvements ?? undefined,
      behavioral: (d.behavioral ?? undefined) as never,
      emotional: (d.emotional ?? undefined) as never,
      technical: (d.technical ?? undefined) as never,
      communication: (d.communication ?? undefined) as never,
    },
    create: {
      userId: req.userId!,
      scores: (d.scores ?? {}) as never,
      strengths: d.strengths ?? [],
      improvements: d.improvements ?? [],
      behavioral: (d.behavioral ?? {}) as never,
      emotional: (d.emotional ?? {}) as never,
      technical: (d.technical ?? {}) as never,
      communication: (d.communication ?? {}) as never,
    },
  });
  await prisma.leaderDNAEvent.create({
    data: {
      dnaId: dna.id,
      kind: "import",
      payload: parsed.data as never,
      source: d.source ?? "manual",
    },
  });
  res.json({ ok: true, dna });
});

// POST /me/onboarding/neo-mentorship — grava se o usuário já fez a mentoria Neo
meRouter.post("/onboarding/neo-mentorship", async (req, res) => {
  const schema = z.object({ did: z.boolean() });
  const parsed = schema.safeParse(req.body ?? {});
  if (!parsed.success) return res.status(400).json({ error: "invalid payload" });
  await prisma.profile.upsert({
    where: { id: req.userId! },
    update: { didNeoMentorship: parsed.data.did },
    create: { id: req.userId!, didNeoMentorship: parsed.data.did },
  });
  res.json({ ok: true });
});

// GET /me/journey/initial — jornada inicial publicada + step atual (best-effort)
meRouter.get("/journey/initial", async (_req, res) => {
  const journey = await prisma.journey.findFirst({
    where: { isInitial: true, status: "active" },
    orderBy: { updatedAt: "desc" },
    include: {
      steps: { orderBy: { orderIndex: "asc" } },
    },
  });
  if (!journey) return res.json({ journey: null });
  res.json({ journey });
});
