import { Router, type Response } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";

/**
 * Tela 3 — Mapa da Equipe.
 * Visão por colaborador: papel, entregas esperadas, indicadores centrais,
 * nível de autonomia, feedback histórico, delegações abertas.
 *
 * Regra: agrega fatos que já existem no sistema. O único conteúdo próprio
 * é o TeamMemberProfile (definido pelo líder).
 */
export const teamRouter = Router();
teamRouter.use(requireAuth);

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
// Informações sensíveis para decisão de carreira só ficam visíveis para
// RH / responsável da organização — nunca para qualquer membro logado.
async function isExec(userId: string, orgId: string) {
  if (await isSuper(userId)) return true;
  const m = await prisma.membership.findFirst({
    where: { userId, organizationId: orgId, role: { in: ["hr_admin", "franchise_owner"] } },
  });
  return !!m;
}
function badReq(res: Response, err: unknown) {
  return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
}

teamRouter.param("orgId", async (req, res, next, orgId) => {
  try {
    if (!(await assertOrgAccess(req.userId!, orgId))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  } catch (err) {
    console.error("[team] falha ao validar acesso", err);
    return res.status(500).json({ error: "Não foi possível validar o acesso à equipe agora." });
  }
});

// GET /:orgId/team — lista consolidada
teamRouter.get("/:orgId/team", async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const memberships = await prisma.membership.findMany({
      where: { organizationId: orgId },
      include: {
        user: { include: { profile: true } },
        area: true,
        team: true,
      },
      orderBy: { createdAt: "asc" },
    });

    const profiles = await prisma.teamMemberProfile
      .findMany({
        where: { organizationId: orgId },
      })
      .catch((err) => {
        console.error("[team] falha ao carregar perfis", err);
        return [];
      });
    const profileByMembership = new Map(profiles.map((p) => [p.membershipId, p]));

    const userIds = memberships.map((m) => m.userId);

    const [openDelegs, feedbacks, pdis] = await Promise.all([
      prisma.delegation
        .groupBy({
          by: ["assigneeId"],
          where: {
            organizationId: orgId,
            assigneeId: { in: userIds },
            status: { notIn: ["done", "canceled"] },
          },
          _count: { _all: true },
        })
        .catch((err) => {
          console.error("[team] falha ao contar delegações", err);
          return [];
        }),
      prisma.feedbackRecord
        .groupBy({
          by: ["subjectUserId"],
          where: { organizationId: orgId, subjectUserId: { in: userIds } },
          _count: { _all: true },
        })
        .catch((err) => {
          console.error("[team] falha ao contar feedbacks", err);
          return [];
        }),
      prisma.pdi
        .findMany({
          where: { organizationId: orgId, subjectUserId: { in: userIds }, status: "ativo" },
          select: { subjectUserId: true },
        })
        .catch((err) => {
          console.error("[team] falha ao carregar PDIs", err);
          return [];
        }),
    ]);

    const delegCount = new Map(openDelegs.map((d) => [d.assigneeId, d._count._all]));
    const feedbackCount = new Map(feedbacks.map((f) => [f.subjectUserId, f._count._all]));
    const activePdi = new Set(pdis.map((p) => p.subjectUserId));

    res.json(
      memberships.map((m) => {
        const profile = profileByMembership.get(m.id);
        return {
          membershipId: m.id,
          userId: m.userId,
          role: m.role,
          fullName: m.user.profile?.fullName ?? m.user.email,
          email: m.user.email,
          avatarUrl: m.user.profile?.avatarUrl ?? null,
          areaName: m.area?.name ?? null,
          teamName: m.team?.name ?? null,
          whatsapp: m.user.profile?.whatsapp ?? m.user.profile?.phone ?? null,
          phone: m.user.profile?.phone ?? null,
          profile: profile
            ? {
                roleTitle: profile.roleTitle,
                expectedDeliverables: profile.expectedDeliverables,
                keyIndicators: profile.keyIndicators,
                autonomyLevel: profile.autonomyLevel,
                strengths: profile.strengths,
                developPoints: profile.developPoints,
                notes: profile.notes,
                performanceLevel: profile.performanceLevel,
                potentialLevel: profile.potentialLevel,
                discPrimary: profile.discPrimary,
              }
            : null,
          openDelegations: delegCount.get(m.userId) ?? 0,
          feedbackCount: feedbackCount.get(m.userId) ?? 0,
          hasActivePdi: activePdi.has(m.userId),
        };
      }),
    );
  } catch (err) {
    console.error("[team] falha ao carregar mapa da equipe", err);
    res.status(500).json({ error: "Não foi possível carregar o mapa da equipe agora." });
  }
});

// GET /:orgId/team/:membershipId — detalhe
teamRouter.get("/:orgId/team/:membershipId", async (req, res) => {
  const { orgId, membershipId } = req.params;
  const m = await prisma.membership.findFirst({
    where: { id: membershipId, organizationId: orgId },
    include: { user: { include: { profile: true } }, area: true, team: true },
  });
  if (!m) return res.status(404).json({ error: "Not found" });

  const canSeeCareer = await isExec(req.userId!, orgId);

  const [profile, feedbacks, delegations, pdis, assessments, pulseSends, oneOnOnes, careerEvents] =
    await Promise.all([
      prisma.teamMemberProfile.findUnique({ where: { membershipId } }),
      prisma.feedbackRecord.findMany({
        where: { organizationId: orgId, subjectUserId: m.userId },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      prisma.delegation.findMany({
        where: { organizationId: orgId, assigneeId: m.userId },
        orderBy: [{ status: "asc" }, { dueAt: "asc" }],
        take: 30,
      }),
      prisma.pdi.findMany({
        where: { organizationId: orgId, subjectUserId: m.userId },
        include: { goals: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.subordinateAssessment.findMany({
        where: { organizationId: orgId, memberId: m.userId },
        orderBy: { updatedAt: "desc" },
        take: 10,
      }),
      prisma.pulseSend.findMany({
        where: { organizationId: orgId, subjectUserId: m.userId, status: "answered" },
        include: { template: { select: { title: true, kind: true } }, answer: true },
        orderBy: { answeredAt: "desc" },
        take: 20,
      }),
      prisma.oneOnOne.findMany({
        where: { organizationId: orgId, subjectUserId: m.userId },
        orderBy: { scheduledAt: "desc" },
        take: 20,
      }),
      canSeeCareer
        ? prisma.careerEvent.findMany({
            where: { organizationId: orgId, membershipId },
            orderBy: { occurredAt: "desc" },
          })
        : Promise.resolve(null),
    ]);

  res.json({
    membershipId: m.id,
    userId: m.userId,
    fullName: m.user.profile?.fullName ?? m.user.email,
    email: m.user.email,
    avatarUrl: m.user.profile?.avatarUrl ?? null,
    role: m.role,
    areaName: m.area?.name ?? null,
    teamName: m.team?.name ?? null,
    profile: profile
      ? {
          ...profile,
          careerNotes: canSeeCareer ? profile.careerNotes : undefined,
          readyForOtherAreas: canSeeCareer ? profile.readyForOtherAreas : undefined,
        }
      : null,
    feedbacks,
    delegations,
    pdis,
    assessments,
    pulseSends,
    oneOnOnes,
    career: canSeeCareer ? { events: careerEvents } : null,
  });
});

const profileSchema = z.object({
  roleTitle: z.string().optional().nullable(),
  expectedDeliverables: z.array(z.string()).default([]),
  keyIndicators: z.array(z.string()).default([]),
  autonomyLevel: z.enum(["n1_direciono", "n2_acompanho", "n3_valido", "n4_delego", "n5_autonomo"]),
  strengths: z.array(z.string()).default([]),
  developPoints: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
  performanceLevel: z.number().int().min(1).max(3).optional().nullable(),
  potentialLevel: z.number().int().min(1).max(3).optional().nullable(),
  discPrimary: z.enum(["D", "I", "S", "C"]).optional().nullable(),
});

teamRouter.put("/:orgId/team/:membershipId/profile", async (req, res) => {
  try {
    const { orgId, membershipId } = req.params;
    const m = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });
    if (!m) return res.status(404).json({ error: "Not found" });
    const data = profileSchema.parse(req.body);
    const saved = await prisma.teamMemberProfile.upsert({
      where: { membershipId },
      update: {
        roleTitle: data.roleTitle ?? null,
        expectedDeliverables: data.expectedDeliverables,
        keyIndicators: data.keyIndicators,
        autonomyLevel: data.autonomyLevel,
        strengths: data.strengths,
        developPoints: data.developPoints,
        notes: data.notes ?? null,
        performanceLevel: data.performanceLevel ?? null,
        potentialLevel: data.potentialLevel ?? null,
        discPrimary: data.discPrimary ?? null,
        updatedBy: req.userId!,
      },
      create: {
        organizationId: orgId,
        membershipId,
        roleTitle: data.roleTitle ?? null,
        expectedDeliverables: data.expectedDeliverables,
        keyIndicators: data.keyIndicators,
        autonomyLevel: data.autonomyLevel,
        strengths: data.strengths,
        developPoints: data.developPoints,
        notes: data.notes ?? null,
        performanceLevel: data.performanceLevel ?? null,
        potentialLevel: data.potentialLevel ?? null,
        discPrimary: data.discPrimary ?? null,
        updatedBy: req.userId!,
      },
    });
    res.json(saved);
  } catch (err) {
    badReq(res, err);
  }
});

// Atalho para 9-box (define só performance × potencial)
const boxSchema = z.object({
  performanceLevel: z.number().int().min(1).max(3),
  potentialLevel: z.number().int().min(1).max(3),
});
teamRouter.put("/:orgId/team/:membershipId/box", async (req, res) => {
  try {
    const { orgId, membershipId } = req.params;
    const m = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });
    if (!m) return res.status(404).json({ error: "Not found" });
    const data = boxSchema.parse(req.body);
    const saved = await prisma.teamMemberProfile.upsert({
      where: { membershipId },
      update: {
        performanceLevel: data.performanceLevel,
        potentialLevel: data.potentialLevel,
        updatedBy: req.userId!,
      },
      create: {
        organizationId: orgId,
        membershipId,
        autonomyLevel: "n2_acompanho",
        performanceLevel: data.performanceLevel,
        potentialLevel: data.potentialLevel,
        updatedBy: req.userId!,
      },
    });
    res.json(saved);
  } catch (err) {
    badReq(res, err);
  }
});
// ============================================================
// Ficha do colaborador — informações sensíveis de carreira
// (apenas RH / responsável da organização)
// ============================================================
const careerNotesSchema = z.object({
  careerNotes: z.string().optional().nullable(),
  readyForOtherAreas: z.boolean().optional(),
});

teamRouter.put("/:orgId/team/:membershipId/career-notes", async (req, res) => {
  const { orgId, membershipId } = req.params;
  if (!(await isExec(req.userId!, orgId))) return res.status(403).json({ error: "Forbidden" });
  try {
    const m = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });
    if (!m) return res.status(404).json({ error: "Not found" });
    const data = careerNotesSchema.parse(req.body);
    const saved = await prisma.teamMemberProfile.upsert({
      where: { membershipId },
      update: {
        ...(data.careerNotes !== undefined ? { careerNotes: data.careerNotes ?? null } : {}),
        ...(data.readyForOtherAreas !== undefined
          ? { readyForOtherAreas: data.readyForOtherAreas }
          : {}),
        updatedBy: req.userId!,
      },
      create: {
        organizationId: orgId,
        membershipId,
        autonomyLevel: "n2_acompanho",
        careerNotes: data.careerNotes ?? null,
        readyForOtherAreas: data.readyForOtherAreas ?? false,
        updatedBy: req.userId!,
      },
    });
    res.json(saved);
  } catch (err) {
    badReq(res, err);
  }
});

const careerEventSchema = z.object({
  type: z.enum(["promotion", "lateral_move", "area_change", "hire", "recognition", "exit"]),
  title: z.string().min(2),
  fromLabel: z.string().optional().nullable(),
  toLabel: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  occurredAt: z.string().datetime(),
});

teamRouter.post("/:orgId/team/:membershipId/career-events", async (req, res) => {
  const { orgId, membershipId } = req.params;
  if (!(await isExec(req.userId!, orgId))) return res.status(403).json({ error: "Forbidden" });
  try {
    const m = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });
    if (!m) return res.status(404).json({ error: "Not found" });
    const data = careerEventSchema.parse(req.body);
    const created = await prisma.careerEvent.create({
      data: {
        organizationId: orgId,
        membershipId,
        type: data.type,
        title: data.title,
        fromLabel: data.fromLabel ?? null,
        toLabel: data.toLabel ?? null,
        notes: data.notes ?? null,
        occurredAt: new Date(data.occurredAt),
        createdBy: req.userId!,
      },
    });
    res.status(201).json(created);
  } catch (err) {
    badReq(res, err);
  }
});

teamRouter.delete("/:orgId/team/:membershipId/career-events/:id", async (req, res) => {
  if (!(await isExec(req.userId!, req.params.orgId)))
    return res.status(403).json({ error: "Forbidden" });
  await prisma.careerEvent.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});

// ============================================================
// Adicionar pessoa direto do Mapa da Equipe
// Cria User + Profile (com whatsapp) + Membership + TeamMemberProfile
// ============================================================
const inviteSchema = z.object({
  fullName: z.string().min(2),
  email: z.string().email(),
  whatsapp: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  role: z.enum(["hr_admin", "leader", "collaborator"]).default("collaborator"),
  areaId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  roleTitle: z.string().optional().nullable(),
  autonomyLevel: z
    .enum(["n1_direciono", "n2_acompanho", "n3_valido", "n4_delego", "n5_autonomo"])
    .default("n2_acompanho"),
  expectedDeliverables: z.array(z.string()).default([]),
  keyIndicators: z.array(z.string()).default([]),
  notes: z.string().optional().nullable(),
});

teamRouter.post("/:orgId/team", async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const data = inviteSchema.parse(req.body);

    // 1) User + Profile
    let user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
      include: { profile: true },
    });
    if (!user) {
      const tempPass = Math.random().toString(36).slice(2) + "A9!";
      user = await prisma.user.create({
        data: {
          email: data.email.toLowerCase(),
          passwordHash: await bcrypt.hash(tempPass, 10),
          profile: {
            create: {
              fullName: data.fullName,
              whatsapp: data.whatsapp || null,
              phone: data.phone || data.whatsapp || null,
            },
          },
        },
        include: { profile: true },
      });
    } else {
      await prisma.profile.upsert({
        where: { id: user.id },
        update: {
          fullName: user.profile?.fullName ?? data.fullName,
          whatsapp: data.whatsapp ?? user.profile?.whatsapp ?? null,
          phone: data.phone ?? user.profile?.phone ?? data.whatsapp ?? null,
        },
        create: {
          id: user.id,
          fullName: data.fullName,
          whatsapp: data.whatsapp || null,
          phone: data.phone || data.whatsapp || null,
        },
      });
    }

    // 2) Membership
    const membership = await prisma.membership.upsert({
      where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
      update: {
        role: data.role,
        areaId: data.areaId || null,
        teamId: data.teamId || null,
        branchId: data.branchId || null,
      },
      create: {
        userId: user.id,
        organizationId: orgId,
        role: data.role,
        areaId: data.areaId || null,
        teamId: data.teamId || null,
        branchId: data.branchId || null,
      },
    });

    // 3) TeamMemberProfile
    await prisma.teamMemberProfile.upsert({
      where: { membershipId: membership.id },
      update: {
        roleTitle: data.roleTitle ?? null,
        autonomyLevel: data.autonomyLevel,
        expectedDeliverables: data.expectedDeliverables,
        keyIndicators: data.keyIndicators,
        notes: data.notes ?? null,
        updatedBy: req.userId!,
      },
      create: {
        organizationId: orgId,
        membershipId: membership.id,
        roleTitle: data.roleTitle ?? null,
        autonomyLevel: data.autonomyLevel,
        expectedDeliverables: data.expectedDeliverables,
        keyIndicators: data.keyIndicators,
        notes: data.notes ?? null,
        updatedBy: req.userId!,
      },
    });

    res.status(201).json({ membershipId: membership.id, userId: user.id });
  } catch (err) {
    badReq(res, err);
  }
});

// Atualiza dados de contato (Profile) do liderado
const contactSchema = z.object({
  fullName: z.string().min(2).optional(),
  whatsapp: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
});
teamRouter.put("/:orgId/team/:membershipId/contact", async (req, res) => {
  try {
    const { orgId, membershipId } = req.params;
    const m = await prisma.membership.findFirst({
      where: { id: membershipId, organizationId: orgId },
    });
    if (!m) return res.status(404).json({ error: "Not found" });
    const data = contactSchema.parse(req.body);
    await prisma.profile.upsert({
      where: { id: m.userId },
      update: {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        ...(data.whatsapp !== undefined ? { whatsapp: data.whatsapp || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
      },
      create: {
        id: m.userId,
        fullName: data.fullName ?? "",
        whatsapp: data.whatsapp || null,
        phone: data.phone || null,
      },
    });
    res.json({ ok: true });
  } catch (err) {
    badReq(res, err);
  }
});
