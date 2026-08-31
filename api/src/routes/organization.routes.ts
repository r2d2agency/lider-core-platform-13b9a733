import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";
import { computeIndicatorSignals } from "./indicators.routes.js";
import { computeCrossSignals } from "./consciencia.routes.js";
import { notifyInApp } from "../lib/notifications.js";
import { assertOrgAccess } from "../lib/org-access.js";
import { parseCsv } from "../lib/csv.js";
import bcrypt from "bcryptjs";

/**
 * MÓDULO ORGANIZAÇÃO — base operacional da liderança.
 *
 * Endpoints agrupados por entidade. Toda entidade é preparada para IA:
 * traz createdAt/updatedAt, createdBy/updatedBy, tags[], contextMd,
 * e (quando aplicável) history[] append-only para diagnóstico futuro.
 *
 * Acesso: exige autenticação + membership na organização (ou super_admin).
 */
export const organizationRouter = Router();
organizationRouter.use(requireAuth);

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function audit(actorUserId: string | undefined, action: string, targetType?: string, targetId?: string, metadata?: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId: actorUserId ?? null,
        action,
        targetType: targetType ?? null,
        targetId: targetId ?? null,
        metadata: metadata ? (metadata as never) : undefined,
      },
    });
  } catch (err) {
    console.error("[audit] falha", err);
  }
}

function badReq(res: Response, err: unknown) {
  return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
}

async function findAreaInOrg(orgId: string, id: string) {
  return prisma.area.findFirst({ where: { id, organizationId: orgId } });
}

async function findTeamInOrg(orgId: string, id: string) {
  return prisma.team.findFirst({ where: { id, organizationId: orgId } });
}

async function findRoleInOrg(orgId: string, id: string) {
  return prisma.orgRole.findFirst({ where: { id, organizationId: orgId } });
}

async function findRitualInOrg(orgId: string, id: string) {
  return prisma.ritual.findFirst({ where: { id, organizationId: orgId } });
}

async function findOccurrenceInOrg(orgId: string, id: string) {
  return prisma.ritualOccurrence.findFirst({
    where: { id, ritual: { organizationId: orgId } },
  });
}

async function findDelegationInOrg(orgId: string, id: string) {
  return prisma.delegation.findFirst({ where: { id, organizationId: orgId } });
}

async function findDecisionInOrg(orgId: string, id: string) {
  return prisma.decision.findFirst({ where: { id, organizationId: orgId } });
}

async function findDocumentInOrg(orgId: string, id: string) {
  return prisma.orgDocument.findFirst({ where: { id, organizationId: orgId } });
}

// Middleware para todas as rotas /:orgId/*
organizationRouter.param("orgId", async (req, res, next, orgId) => {
  if (!(await assertOrgAccess(req.userId!, orgId))) {
    return res.status(403).json({ error: "Forbidden" });
  }
  next();
});

// ============================================================
// 1. ORG MAP — árvore agregada com contagens e líderes
// ============================================================
organizationRouter.get("/:orgId/map", async (req, res) => {
  const orgId = req.params.orgId;
  const [org, branches, areas, teams, memberships, tmProfiles] = await Promise.all([
    prisma.organization.findUnique({ where: { id: orgId } }),
    prisma.branch.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    prisma.area.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    prisma.team.findMany({ where: { organizationId: orgId }, orderBy: { name: "asc" } }),
    prisma.membership.findMany({
      where: { organizationId: orgId },
      include: { user: { include: { profile: true } } },
    }),
    prisma.teamMemberProfile.findMany({ where: { organizationId: orgId } }),
  ]);
  const roleTitleByMembership = new Map(tmProfiles.map((p) => [p.membershipId, p.roleTitle]));
  if (!org) return res.status(404).json({ error: "Organização não encontrada" });

  const membersByTeam = new Map<string, typeof memberships>();
  const membersByArea = new Map<string, typeof memberships>();
  const membersByBranch = new Map<string, typeof memberships>();
  const pushInto = (map: Map<string, typeof memberships>, key: string, item: (typeof memberships)[number]) => {
    const arr = map.get(key);
    if (arr) arr.push(item); else map.set(key, [item]);
  };
  for (const m of memberships) {
    if (m.teamId) pushInto(membersByTeam, m.teamId, m);
    if (m.areaId) pushInto(membersByArea, m.areaId, m);
    if (m.branchId) pushInto(membersByBranch, m.branchId, m);
  }

  const mapMember = (m: (typeof memberships)[number]) => ({
    id: m.id,
    userId: m.userId,
    name: m.user.profile?.fullName ?? m.user.email,
    email: m.user.email,
    avatar: m.user.profile?.avatarUrl ?? null,
    role: m.role,
    roleTitle: roleTitleByMembership.get(m.id) ?? null,
    directLeaderId: m.directLeaderId,
  });

  const areasTree = areas.map((a) => ({
    id: a.id,
    name: a.name,
    branchId: a.branchId,
    mission: a.mission,
    objective: a.objective,
    kpis: a.kpis,
    managerUserId: a.managerUserId,
    peopleCount: membersByArea.get(a.id)?.length ?? 0,
    teams: teams.filter((t) => t.areaId === a.id).map((t) => ({
      id: t.id,
      name: t.name,
      objectives: t.objectives,
      mission: t.mission,
      leaderMembershipId: t.leaderMembershipId,
      peopleCount: membersByTeam.get(t.id)?.length ?? 0,
      members: (membersByTeam.get(t.id) ?? []).map(mapMember),
    })),
  }));

  const branchesTree = branches.map((b) => ({
    id: b.id,
    name: b.name,
    code: b.code,
    city: b.city,
    peopleCount: membersByBranch.get(b.id)?.length ?? 0,
    areas: areasTree.filter((a) => a.branchId === b.id),
  }));

  const areasWithoutBranch = areasTree.filter((a) => !a.branchId);

  res.json({
    organization: { id: org.id, name: org.name, slug: org.slug, logoUrl: org.logoUrl },
    totals: {
      branches: branches.length,
      areas: areas.length,
      teams: teams.length,
      people: memberships.length,
      leaders: memberships.filter((m) => m.role === "leader" || m.role === "hr_admin").length,
    },
    branches: branchesTree,
    areasWithoutBranch,
  });
});

// ============================================================
// 1b. IMPORTAÇÃO DE ORGANOGRAMA (CSV)
// Colunas aceitas: filial, area, equipe, cargo, nome, email,
// whatsapp, nivel (lider|colaborador), lider_email
// ============================================================
const ORG_IMPORT_TEMPLATE = [
  "filial,area,equipe,cargo,nome,email,whatsapp,nivel,lider_email",
  "Matriz,Comercial,Vendas Interna,Gerente Comercial,Ana Souza,ana@empresa.com,+5511999990000,lider,",
  "Matriz,Comercial,Vendas Interna,Executivo de Vendas,Bruno Lima,bruno@empresa.com,+5511999990001,colaborador,ana@empresa.com",
  "Matriz,Operações,Logística,Coordenador de Logística,Carla Dias,carla@empresa.com,,lider,",
].join("\n");

type ImportRow = {
  branch: string;
  area: string;
  team: string;
  roleTitle: string;
  name: string;
  email: string;
  whatsapp: string;
  level: "leader" | "collaborator";
  leaderEmail: string;
};

function normalizeImportRows(rows: Record<string, string>[]) {
  const pick = (r: Record<string, string>, keys: string[]) => {
    for (const k of keys) if (r[k]) return r[k].trim();
    return "";
  };
  const out: ImportRow[] = [];
  const errors: string[] = [];
  rows.forEach((r, i) => {
    const email = pick(r, ["email", "e-mail", "email_corporativo"]).toLowerCase();
    const name = pick(r, ["nome", "name", "colaborador", "pessoa"]);
    const area = pick(r, ["area", "área", "departamento", "setor"]);
    const team = pick(r, ["equipe", "time", "team", "celula", "célula"]);
    const branch = pick(r, ["filial", "unidade", "branch"]);
    const roleTitle = pick(r, ["cargo", "role", "posicao", "posição", "funcao", "função"]);
    const whatsapp = pick(r, ["whatsapp", "celular", "telefone", "phone"]);
    const levelRaw = pick(r, ["nivel", "nível", "tipo", "level"]).toLowerCase();
    const leaderEmail = pick(r, ["lider_email", "líder_email", "email_lider", "gestor_email", "lider"]).toLowerCase();
    if (!name && !email && !area && !team) return;
    if (!area) {
      errors.push(`Linha ${i + 2}: coluna "area" é obrigatória.`);
      return;
    }
    if (name && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      errors.push(`Linha ${i + 2}: e-mail inválido ou ausente para "${name}".`);
      return;
    }
    out.push({
      branch,
      area,
      team,
      roleTitle,
      name,
      email,
      whatsapp,
      level: /lider|líder|gestor|gerente|coord/.test(levelRaw) ? "leader" : "collaborator",
      leaderEmail: leaderEmail.includes("@") ? leaderEmail : "",
    });
  });
  return { rows: out, errors };
}

organizationRouter.get("/:orgId/map/import/template", (_req, res) => {
  res.type("text/csv").send(ORG_IMPORT_TEMPLATE);
});

// Converte um arquivo (PDF, DOCX, imagem, planilha exportada em texto) no CSV
// padrão do organograma, usando a IA configurada pelo administrador.
const parseFileSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().min(1),
  base64: z.string().min(1),
});

organizationRouter.post("/:orgId/map/import/parse-file", async (req, res) => {
  try {
    const { filename, mimeType, base64 } = parseFileSchema.parse(req.body);
    const raw = await extractDocumentText({ filename, mimeType, base64 });
    if (!raw.trim()) return res.status(422).json({ error: "Não foi possível ler o conteúdo do arquivo." });

    const csv = await completeChat({
      temperature: 0,
      messages: [
        {
          role: "system",
          content:
            "Você converte organogramas em CSV. Responda APENAS com CSV válido, sem comentários e sem blocos de código. " +
            "Cabeçalho obrigatório e exato: filial,area,equipe,cargo,nome,email,whatsapp,nivel,lider_email. " +
            "Uma linha por pessoa. 'nivel' deve ser 'lider' ou 'colaborador'. " +
            "'lider_email' é o e-mail do gestor direto (vazio para o topo da hierarquia). " +
            "Se não houver e-mail no documento, deixe as colunas nome/email vazias e registre apenas a estrutura (filial/area/equipe/cargo). " +
            "Nunca invente nomes, e-mails ou cargos que não estejam no documento.",
        },
        { role: "user", content: `Documento: ${filename}\n\nConteúdo extraído:\n${raw}` },
      ],
    });

    const clean = csv
      .replace(/^```[a-z]*\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();
    if (!/filial|area/i.test(clean.split(/\r?\n/)[0] ?? "")) {
      return res.status(422).json({ error: "A IA não conseguiu montar o organograma a partir deste arquivo." });
    }
    res.json({ csv: clean });
  } catch (err) {
    return badReq(res, err);
  }
});


const importBodySchema = z.object({ csv: z.string().min(1), dryRun: z.boolean().default(false) });

organizationRouter.post("/:orgId/map/import", async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const { csv, dryRun } = importBodySchema.parse(req.body);
    const parsed = parseCsv(csv);
    if (!parsed.length) return res.status(400).json({ error: "CSV vazio ou sem linhas de dados." });
    const { rows, errors } = normalizeImportRows(parsed);
    if (!rows.length) {
      return res.status(400).json({ error: "Nenhuma linha válida encontrada.", errors });
    }

    const branchNames = Array.from(new Set(rows.map((r) => r.branch).filter(Boolean)));
    const areaKeys = Array.from(new Set(rows.map((r) => `${r.branch}|||${r.area}`)));
    const teamKeys = Array.from(new Set(rows.filter((r) => r.team).map((r) => `${r.branch}|||${r.area}|||${r.team}`)));
    const roleTitles = Array.from(new Set(rows.map((r) => r.roleTitle).filter(Boolean)));
    const people = rows.filter((r) => r.name && r.email);

    const summary = {
      branches: branchNames.length,
      areas: areaKeys.length,
      teams: teamKeys.length,
      roles: roleTitles.length,
      people: people.length,
      leaders: people.filter((p) => p.level === "leader").length,
      errors,
      preview: rows.slice(0, 25),
    };

    if (dryRun) return res.json({ dryRun: true, ...summary });

    // --- Filiais
    const branchByName = new Map<string, string>();
    for (const name of branchNames) {
      const existing = await prisma.branch.findFirst({ where: { organizationId: orgId, name } });
      const b = existing ?? (await prisma.branch.create({ data: { organizationId: orgId, name } }));
      branchByName.set(name, b.id);
    }

    // --- Áreas
    const areaByKey = new Map<string, string>();
    for (const key of areaKeys) {
      const [branchName, areaName] = key.split("|||");
      const branchId = branchName ? branchByName.get(branchName) ?? null : null;
      const existing = await prisma.area.findFirst({ where: { organizationId: orgId, name: areaName } });
      const a = existing
        ? await prisma.area.update({ where: { id: existing.id }, data: { branchId: existing.branchId ?? branchId } })
        : await prisma.area.create({ data: { organizationId: orgId, name: areaName, branchId } });
      areaByKey.set(key, a.id);
    }

    // --- Equipes
    const teamByKey = new Map<string, string>();
    for (const key of teamKeys) {
      const [branchName, areaName, teamName] = key.split("|||");
      const areaId = areaByKey.get(`${branchName}|||${areaName}`)!;
      const existing = await prisma.team.findFirst({ where: { organizationId: orgId, areaId, name: teamName } });
      const t = existing ?? (await prisma.team.create({ data: { organizationId: orgId, areaId, name: teamName } }));
      teamByKey.set(key, t.id);
    }

    // --- Cargos
    const roleByTitle = new Map<string, string>();
    for (const title of roleTitles) {
      const existing = await prisma.orgRole.findFirst({ where: { organizationId: orgId, title } });
      const isLeader = rows.some((r) => r.roleTitle === title && r.level === "leader");
      const role = existing
        ? await prisma.orgRole.update({ where: { id: existing.id }, data: { isLeader: existing.isLeader || isLeader } })
        : await prisma.orgRole.create({ data: { organizationId: orgId, title, isLeader, createdBy: req.userId! } });
      roleByTitle.set(title, role.id);
    }

    // --- Pessoas (User + Profile + Membership + cargo)
    const membershipByEmail = new Map<string, string>();
    for (const p of people) {
      let user = await prisma.user.findUnique({ where: { email: p.email }, include: { profile: true } });
      if (!user) {
        const tempPass = Math.random().toString(36).slice(2) + "A9!";
        user = await prisma.user.create({
          data: {
            email: p.email,
            passwordHash: await bcrypt.hash(tempPass, 10),
            profile: { create: { fullName: p.name, whatsapp: p.whatsapp || null, jobTitle: p.roleTitle || null } },
          },
          include: { profile: true },
        });
      } else {
        await prisma.profile.upsert({
          where: { id: user.id },
          update: {
            fullName: user.profile?.fullName ?? p.name,
            whatsapp: p.whatsapp || user.profile?.whatsapp || null,
            jobTitle: p.roleTitle || user.profile?.jobTitle || null,
          },
          create: { id: user.id, fullName: p.name, whatsapp: p.whatsapp || null, jobTitle: p.roleTitle || null },
        });
      }

      const areaId = areaByKey.get(`${p.branch}|||${p.area}`) ?? null;
      const teamId = p.team ? teamByKey.get(`${p.branch}|||${p.area}|||${p.team}`) ?? null : null;
      const branchId = p.branch ? branchByName.get(p.branch) ?? null : null;

      const membership = await prisma.membership.upsert({
        where: { userId_organizationId: { userId: user.id, organizationId: orgId } },
        update: { areaId, teamId, branchId, role: p.level === "leader" ? "leader" : "collaborator" },
        create: {
          userId: user.id,
          organizationId: orgId,
          areaId,
          teamId,
          branchId,
          role: p.level === "leader" ? "leader" : "collaborator",
        },
      });
      membershipByEmail.set(p.email, membership.id);

      await prisma.teamMemberProfile.upsert({
        where: { membershipId: membership.id },
        update: { roleTitle: p.roleTitle || null, updatedBy: req.userId! },
        create: {
          organizationId: orgId,
          membershipId: membership.id,
          roleTitle: p.roleTitle || null,
          updatedBy: req.userId!,
        },
      });

      const roleId = p.roleTitle ? roleByTitle.get(p.roleTitle) : null;
      if (roleId) {
        const exists = await prisma.roleAssignment.findFirst({ where: { roleId, membershipId: membership.id } });
        if (!exists) await prisma.roleAssignment.create({ data: { roleId, membershipId: membership.id } });
      }

      // Líder da equipe
      if (p.level === "leader" && teamId) {
        await prisma.team.update({ where: { id: teamId }, data: { leaderMembershipId: membership.id } });
      }
    }

    // --- Vínculo líder direto (2ª passada, já com todos os memberships criados)
    let linkedLeaders = 0;
    for (const p of people) {
      if (!p.leaderEmail) continue;
      const membershipId = membershipByEmail.get(p.email);
      const leaderMembershipId = membershipByEmail.get(p.leaderEmail);
      if (!membershipId || !leaderMembershipId) continue;
      const leaderMembership = await prisma.membership.findUnique({ where: { id: leaderMembershipId } });
      if (!leaderMembership) continue;
      await prisma.membership.update({
        where: { id: membershipId },
        data: { directLeaderId: leaderMembership.userId },
      });
      linkedLeaders++;
    }

    await audit(req.userId, "org.map.import", "organization", orgId, {
      ...summary,
      preview: undefined,
      linkedLeaders,
    });

    res.json({ ok: true, ...summary, linkedLeaders, preview: undefined });
  } catch (err) {
    return badReq(res, err);
  }
});


// ============================================================
// 2. AREAS — extensão (mission, objective, kpis, contextMd)
// ============================================================
const areaExtSchema = z.object({
  mission: z.string().optional().nullable(),
  objective: z.string().optional().nullable(),
  kpis: z.array(z.string()).optional(),
  purpose: z.string().optional().nullable(),
  deliverables: z.array(z.string()).optional(),
  contextMd: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
  managerUserId: z.string().uuid().optional().nullable(),
});

organizationRouter.patch("/:orgId/areas/:id", async (req, res) => {
  try {
    const data = areaExtSchema.parse(req.body);
    const existing = await findAreaInOrg(req.params.orgId, req.params.id);
    if (!existing) return res.status(404).json({ error: "Área não encontrada" });
    const a = await prisma.area.update({
      where: { id: req.params.id },
      data: { ...data, updatedAt: new Date() },
    });
    await audit(req.userId, "area.update", "area", a.id, data);
    res.json(a);
  } catch (err) { badReq(res, err); }
});

organizationRouter.get("/:orgId/areas/:id", async (req, res) => {
  const area = await prisma.area.findFirst({
    where: { id: req.params.id, organizationId: req.params.orgId },
    include: {
      branch: true,
      teams: { include: { _count: { select: { memberships: true } } } },
      _count: { select: { memberships: true } },
    },
  });
  if (!area) return res.status(404).json({ error: "Área não encontrada" });
  res.json(area);
});

// ============================================================
// 3. TEAMS — extensão
// ============================================================
const teamExtSchema = z.object({
  mission: z.string().optional().nullable(),
  objectives: z.string().optional().nullable(),
  kpis: z.array(z.string()).optional(),
  leaderMembershipId: z.string().uuid().optional().nullable(),
  contextMd: z.string().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

organizationRouter.patch("/:orgId/teams/:id", async (req, res) => {
  try {
    const data = teamExtSchema.parse(req.body);
    const existing = await findTeamInOrg(req.params.orgId, req.params.id);
    if (!existing) return res.status(404).json({ error: "Time não encontrado" });
    const t = await prisma.team.update({ where: { id: req.params.id }, data: { ...data, updatedAt: new Date() } });
    await audit(req.userId, "team.update", "team", t.id, data);
    res.json(t);
  } catch (err) { badReq(res, err); }
});

// ============================================================
// 4. ROLES — cargos e responsabilidades
// ============================================================
const roleSchema = z.object({
  title: z.string().min(1),
  mission: z.string().optional().nullable(),
  responsibilities: z.array(z.string()).default([]),
  deliverables: z.array(z.string()).default([]),
  competencies: z.array(z.string()).default([]),
  relationships: z.array(z.string()).default([]),
  isLeader: z.boolean().default(false),
  slaText: z.string().optional().nullable(),
  doneCriteria: z.string().optional().nullable(),
  contextMd: z.string().optional().nullable(),
  tags: z.array(z.string()).default([]),
});

organizationRouter.get("/:orgId/roles", async (req, res) => {
  const roles = await prisma.orgRole.findMany({
    where: { organizationId: req.params.orgId },
    orderBy: { title: "asc" },
    include: { _count: { select: { assignments: true } } },
  });
  res.json(roles);
});

organizationRouter.post("/:orgId/roles", async (req, res) => {
  try {
    const data = roleSchema.parse(req.body);
    const r = await prisma.orgRole.create({
      data: { ...data, organizationId: req.params.orgId, createdBy: req.userId, updatedBy: req.userId },
    });
    await audit(req.userId, "role.create", "role", r.id);
    res.status(201).json(r);
  } catch (err) { badReq(res, err); }
});

organizationRouter.patch("/:orgId/roles/:id", async (req, res) => {
  try {
    const data = roleSchema.partial().parse(req.body);
    const r = await prisma.orgRole.update({
      where: { id: req.params.id },
      data: { ...data, updatedBy: req.userId },
    });
    await audit(req.userId, "role.update", "role", r.id, data);
    res.json(r);
  } catch (err) { badReq(res, err); }
});

organizationRouter.delete("/:orgId/roles/:id", async (req, res) => {
  const existing = await findRoleInOrg(req.params.orgId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Cargo não encontrado" });
  await prisma.orgRole.delete({ where: { id: req.params.id } }).catch(() => null);
  await audit(req.userId, "role.delete", "role", req.params.id);
  res.status(204).end();
});

// ============================================================
// 5. RITUALS
// ============================================================
const ritualSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["daily", "weekly", "one_on_one", "feedback", "action_plan", "indicators", "strategic", "day_one", "checkpoint", "retro", "custom"]).default("custom"),
  scope: z.enum(["org", "branch", "area", "team"]).default("team"),
  scopeId: z.string().uuid().optional().nullable(),
  objective: z.string().optional().nullable(),
  cadence: z.string().optional().nullable(),
  ownerId: z.string().uuid().optional().nullable(),
  durationMin: z.number().int().min(5).max(600).default(30),
  agendaTemplate: z.string().optional().nullable(),
  checklist: z.array(z.string()).optional(),
  tags: z.array(z.string()).default([]),
  contextMd: z.string().optional().nullable(),
  participantMembershipIds: z.array(z.string().uuid()).optional(),
});

organizationRouter.get("/:orgId/rituals", async (req, res) => {
  const scope = req.query.scope as string | undefined;
  const scopeId = req.query.scopeId as string | undefined;
  const rituals = await prisma.ritual.findMany({
    where: {
      organizationId: req.params.orgId,
      ...(scope ? { scope: scope as never } : {}),
      ...(scopeId ? { scopeId } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      _count: { select: { participants: true, occurrences: true } },
      occurrences: {
        orderBy: { scheduledAt: "desc" },
        take: 1,
      },
    },
  });
  res.json(rituals);
});

organizationRouter.get("/:orgId/rituals/:id", async (req, res) => {
  const r = await prisma.ritual.findFirst({
    where: { id: req.params.id, organizationId: req.params.orgId },
    include: {
      participants: { include: { membership: { include: { user: { include: { profile: true } } } } } },
      occurrences: { orderBy: { scheduledAt: "desc" }, take: 20 },
    },
  });
  if (!r) return res.status(404).json({ error: "Ritual não encontrado" });
  res.json(r);
});

organizationRouter.post("/:orgId/rituals", async (req, res) => {
  try {
    const { participantMembershipIds, checklist, ...data } = ritualSchema.parse(req.body);
    const r = await prisma.ritual.create({
      data: {
        ...data,
        checklist: checklist ? (checklist as never) : undefined,
        organizationId: req.params.orgId,
        createdBy: req.userId,
        updatedBy: req.userId,
      },
    });
    if (participantMembershipIds?.length) {
      await prisma.ritualParticipant.createMany({
        data: participantMembershipIds.map((membershipId) => ({ ritualId: r.id, membershipId })),
        skipDuplicates: true,
      });
    }
    await audit(req.userId, "ritual.create", "ritual", r.id);
    res.status(201).json(r);
  } catch (err) { badReq(res, err); }
});

organizationRouter.patch("/:orgId/rituals/:id", async (req, res) => {
  try {
    const { participantMembershipIds, checklist, ...data } = ritualSchema.partial().parse(req.body);
    const existing = await findRitualInOrg(req.params.orgId, req.params.id);
    if (!existing) return res.status(404).json({ error: "Ritual não encontrado" });
    const r = await prisma.ritual.update({
      where: { id: req.params.id },
      data: {
        ...data,
        checklist: checklist ? (checklist as never) : undefined,
        updatedBy: req.userId,
      },
    });
    if (participantMembershipIds) {
      await prisma.ritualParticipant.deleteMany({ where: { ritualId: r.id } });
      if (participantMembershipIds.length) {
        await prisma.ritualParticipant.createMany({
          data: participantMembershipIds.map((membershipId) => ({ ritualId: r.id, membershipId })),
          skipDuplicates: true,
        });
      }
    }
    await audit(req.userId, "ritual.update", "ritual", r.id);
    res.json(r);
  } catch (err) { badReq(res, err); }
});

organizationRouter.delete("/:orgId/rituals/:id", async (req, res) => {
  const existing = await findRitualInOrg(req.params.orgId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Ritual não encontrado" });
  await prisma.ritual.delete({ where: { id: req.params.id } }).catch(() => null);
  await audit(req.userId, "ritual.delete", "ritual", req.params.id);
  res.status(204).end();
});

// Ocorrências
const occurrenceSchema = z.object({
  scheduledAt: z.string().datetime().or(z.date()),
  notes: z.string().optional().nullable(),
});

organizationRouter.post("/:orgId/rituals/:id/occurrences", async (req, res) => {
  try {
    const data = occurrenceSchema.parse(req.body);
    const ritual = await findRitualInOrg(req.params.orgId, req.params.id);
    if (!ritual) return res.status(404).json({ error: "Ritual não encontrado" });
    const o = await prisma.ritualOccurrence.create({
      data: {
        ritualId: req.params.id,
        scheduledAt: new Date(data.scheduledAt),
        notes: data.notes ?? undefined,
      },
    });
    await audit(req.userId, "occurrence.create", "ritual_occurrence", o.id);
    res.status(201).json(o);
  } catch (err) { badReq(res, err); }
});

organizationRouter.patch("/:orgId/occurrences/:id", async (req, res) => {
  try {
    const existing = await findOccurrenceInOrg(req.params.orgId, req.params.id);
    if (!existing) return res.status(404).json({ error: "Ocorrência não encontrada" });
    const body = z.object({
      status: z.enum(["scheduled", "in_progress", "done", "missed", "canceled"]).optional(),
      startedAt: z.string().datetime().optional(),
      endedAt: z.string().datetime().optional(),
      minutes: z.string().optional(),
      notes: z.string().optional(),
      pendings: z.array(z.object({ text: z.string(), owner: z.string().optional(), due: z.string().optional() })).optional(),
    }).parse(req.body);
    const o = await prisma.ritualOccurrence.update({
      where: { id: req.params.id },
      data: {
        ...body,
        startedAt: body.startedAt ? new Date(body.startedAt) : undefined,
        endedAt: body.endedAt ? new Date(body.endedAt) : undefined,
        pendings: body.pendings ? (body.pendings as never) : undefined,
      },
    });
    await audit(req.userId, "occurrence.update", "ritual_occurrence", o.id, body);
    res.json(o);
  } catch (err) { badReq(res, err); }
});

// ============================================================
// 6. DELEGATIONS
// ============================================================
const delegationSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional().nullable(),
  assigneeId: z.string().uuid().optional().nullable(),
  areaId: z.string().uuid().optional().nullable(),
  teamId: z.string().uuid().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  doneCriteria: z.string().optional().nullable(),
  status: z.enum(["open", "in_progress", "blocked", "done", "canceled"]).default("open"),
  tags: z.array(z.string()).default([]),
  contextMd: z.string().optional().nullable(),
});

organizationRouter.get("/:orgId/delegations", async (req, res) => {
  const status = req.query.status as string | undefined;
  const d = await prisma.delegation.findMany({
    where: {
      organizationId: req.params.orgId,
      ...(status ? { status: status as never } : {}),
    },
    orderBy: [{ status: "asc" }, { dueAt: "asc" }],
    include: { _count: { select: { comments: true } } },
  });
  res.json(d);
});

organizationRouter.post("/:orgId/delegations", async (req, res) => {
  try {
    const data = delegationSchema.parse(req.body);
    const d = await prisma.delegation.create({
      data: {
        ...data,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        organizationId: req.params.orgId,
        delegatorId: req.userId,
        createdBy: req.userId,
        updatedBy: req.userId,
        history: [{ at: new Date().toISOString(), by: req.userId, action: "create" }] as never,
      },
    });
    await audit(req.userId, "delegation.create", "delegation", d.id);
    if (d.assigneeId && d.assigneeId !== req.userId) {
      void notifyInApp({
        userId: d.assigneeId,
        organizationId: d.organizationId,
        title: "Nova delegação para você",
        body: d.title + (d.dueAt ? ` — prazo ${new Date(d.dueAt).toLocaleDateString("pt-BR")}` : ""),
        linkUrl: "/app/organization/delegations",
      }).catch(() => null);
    }
    res.status(201).json(d);
  } catch (err) { badReq(res, err); }
});

organizationRouter.patch("/:orgId/delegations/:id", async (req, res) => {
  try {
    const data = delegationSchema.partial().parse(req.body);
    const existing = await findDelegationInOrg(req.params.orgId, req.params.id);
    if (!existing) return res.status(404).json({ error: "Não encontrada" });
    const hist = Array.isArray(existing.history) ? (existing.history as unknown[]) : [];
    hist.push({ at: new Date().toISOString(), by: req.userId, changes: data });
    const d = await prisma.delegation.update({
      where: { id: req.params.id },
      data: {
        ...data,
        dueAt: data.dueAt ? new Date(data.dueAt) : data.dueAt === null ? null : undefined,
        doneAt: data.status === "done" ? new Date() : data.status ? null : undefined,
        updatedBy: req.userId,
        history: hist as never,
      },
    });
    await audit(req.userId, "delegation.update", "delegation", d.id, data);
    if (
      data.assigneeId &&
      data.assigneeId !== existing.assigneeId &&
      data.assigneeId !== req.userId
    ) {
      void notifyInApp({
        userId: data.assigneeId,
        organizationId: d.organizationId,
        title: "Delegação atribuída a você",
        body: d.title,
        linkUrl: "/app/organization/delegations",
      }).catch(() => null);
    }
    res.json(d);
  } catch (err) { badReq(res, err); }
});

organizationRouter.delete("/:orgId/delegations/:id", async (req, res) => {
  const existing = await findDelegationInOrg(req.params.orgId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Não encontrada" });
  await prisma.delegation.delete({ where: { id: req.params.id } }).catch(() => null);
  await audit(req.userId, "delegation.delete", "delegation", req.params.id);
  res.status(204).end();
});

organizationRouter.post("/:orgId/delegations/:id/comments", async (req, res) => {
  try {
    const { body } = z.object({ body: z.string().min(1) }).parse(req.body);
    const delegation = await findDelegationInOrg(req.params.orgId, req.params.id);
    if (!delegation) return res.status(404).json({ error: "Não encontrada" });
    const c = await prisma.delegationComment.create({
      data: { delegationId: req.params.id, authorId: req.userId, body },
    });
    res.status(201).json(c);
  } catch (err) { badReq(res, err); }
});

// -- Follow-up ativo (Etapa 3) --------------------------------
// Lista delegações que precisam de cobrança: vencidas ou paradas há 7+ dias.
organizationRouter.get("/:orgId/delegations/follow-up", async (req, res) => {
  const now = new Date();
  const staleSince = new Date(now.getTime() - 7 * 86400000);
  const items = await prisma.delegation.findMany({
    where: {
      organizationId: req.params.orgId,
      status: { in: ["open", "in_progress", "blocked"] },
      OR: [
        { dueAt: { lt: now } },
        { updatedAt: { lt: staleSince } },
      ],
    },
    orderBy: [{ dueAt: "asc" }, { updatedAt: "asc" }],
    take: 50,
  });
  const enriched = items.map((d) => {
    const overdueDays = d.dueAt ? Math.floor((now.getTime() - d.dueAt.getTime()) / 86400000) : null;
    const staleDays = Math.floor((now.getTime() - d.updatedAt.getTime()) / 86400000);
    return {
      id: d.id,
      title: d.title,
      status: d.status,
      priority: d.priority,
      dueAt: d.dueAt,
      assigneeId: d.assigneeId,
      overdueDays: overdueDays != null && overdueDays > 0 ? overdueDays : null,
      staleDays,
      reason: overdueDays != null && overdueDays > 0
        ? `Atrasada há ${overdueDays} dia(s)`
        : `Sem movimento há ${staleDays} dia(s)`,
    };
  });
  res.json(enriched);
});

// Cobrança educada: notifica o responsável e registra na history.
organizationRouter.post("/:orgId/delegations/:id/nudge", async (req, res) => {
  try {
    const { message } = z.object({ message: z.string().optional() }).parse(req.body ?? {});
    const d = await findDelegationInOrg(req.params.orgId, req.params.id);
    if (!d) return res.status(404).json({ error: "Não encontrada" });
    if (!d.assigneeId) return res.status(400).json({ error: "Delegação sem responsável" });
    const hist = Array.isArray(d.history) ? (d.history as unknown[]) : [];
    hist.push({ at: new Date().toISOString(), by: req.userId, action: "nudge", message: message ?? null });
    await prisma.delegation.update({
      where: { id: d.id },
      data: { history: hist as never, updatedBy: req.userId },
    });
    await notifyInApp({
      userId: d.assigneeId,
      organizationId: d.organizationId,
      title: "Cobrança sobre delegação",
      body: message?.trim() || `Lembrete: "${d.title}"${d.dueAt ? ` — prazo ${new Date(d.dueAt).toLocaleDateString("pt-BR")}` : ""}`,
      linkUrl: "/app/organization/delegations",
    }).catch(() => null);
    await audit(req.userId, "delegation.nudge", "delegation", d.id, { message });
    res.json({ ok: true });
  } catch (err) { badReq(res, err); }
});

// Check-in rápido de ocorrência (1 clique: feita ou perdida)
organizationRouter.post("/:orgId/occurrences/:id/quick-checkin", async (req, res) => {
  try {
    const existing = await findOccurrenceInOrg(req.params.orgId, req.params.id);
    if (!existing) return res.status(404).json({ error: "Ocorrência não encontrada" });
    const { status, note } = z.object({
      status: z.enum(["done", "missed"]),
      note: z.string().optional(),
    }).parse(req.body);
    const o = await prisma.ritualOccurrence.update({
      where: { id: req.params.id },
      data: {
        status: status as never,
        endedAt: new Date(),
        notes: note ?? undefined,
      },
    });
    await audit(req.userId, "occurrence.quick_checkin", "ritual_occurrence", o.id, { status });
    res.json(o);
  } catch (err) { badReq(res, err); }
});

// Ocorrências de hoje/próximas 24h para o usuário logado (owner ou participante)
organizationRouter.get("/:orgId/occurrences/today", async (req, res) => {
  const orgId = req.params.orgId;
  const userId = req.userId!;
  const now = new Date();
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const end = new Date(now); end.setHours(23, 59, 59, 999);
  const [owned, parts] = await Promise.all([
    prisma.ritual.findMany({ where: { organizationId: orgId, ownerId: userId }, select: { id: true } }),
    prisma.ritualParticipant.findMany({
      where: { membership: { organizationId: orgId, userId } },
      select: { ritualId: true },
    }),
  ]);
  const ritualIds = Array.from(new Set([...owned.map((r) => r.id), ...parts.map((p) => p.ritualId)]));
  if (!ritualIds.length) return res.json([]);
  const items = await prisma.ritualOccurrence.findMany({
    where: {
      ritualId: { in: ritualIds },
      scheduledAt: { gte: start, lte: end },
    },
    include: { ritual: { select: { name: true, type: true } } },
    orderBy: { scheduledAt: "asc" },
  });
  res.json(items);
});

// ============================================================
// 7. DECISIONS
// ============================================================
const decisionSchema = z.object({
  title: z.string().min(1),
  context: z.string().optional().nullable(),
  decision: z.string().min(1),
  ownerId: z.string().uuid().optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  expectedResult: z.string().optional().nullable(),
  ritualOccurrenceId: z.string().uuid().optional().nullable(),
  status: z.enum(["open", "in_progress", "done", "reverted"]).default("open"),
  tags: z.array(z.string()).default([]),
});

organizationRouter.get("/:orgId/decisions", async (req, res) => {
  const d = await prisma.decision.findMany({
    where: { organizationId: req.params.orgId },
    orderBy: { createdAt: "desc" },
  });
  res.json(d);
});

organizationRouter.post("/:orgId/decisions", async (req, res) => {
  try {
    const data = decisionSchema.parse(req.body);
    const d = await prisma.decision.create({
      data: {
        ...data,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        organizationId: req.params.orgId,
        createdBy: req.userId,
        updatedBy: req.userId,
        history: [{ at: new Date().toISOString(), by: req.userId, action: "create" }] as never,
      },
    });
    await audit(req.userId, "decision.create", "decision", d.id);
    res.status(201).json(d);
  } catch (err) { badReq(res, err); }
});

organizationRouter.patch("/:orgId/decisions/:id", async (req, res) => {
  try {
    const data = decisionSchema.partial().parse(req.body);
    const existing = await findDecisionInOrg(req.params.orgId, req.params.id);
    if (!existing) return res.status(404).json({ error: "Não encontrada" });
    const hist = Array.isArray(existing.history) ? (existing.history as unknown[]) : [];
    hist.push({ at: new Date().toISOString(), by: req.userId, changes: data });
    const d = await prisma.decision.update({
      where: { id: req.params.id },
      data: {
        ...data,
        dueAt: data.dueAt ? new Date(data.dueAt) : data.dueAt === null ? null : undefined,
        updatedBy: req.userId,
        history: hist as never,
      },
    });
    await audit(req.userId, "decision.update", "decision", d.id, data);
    res.json(d);
  } catch (err) { badReq(res, err); }
});

organizationRouter.delete("/:orgId/decisions/:id", async (req, res) => {
  const existing = await findDecisionInOrg(req.params.orgId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Não encontrada" });
  await prisma.decision.delete({ where: { id: req.params.id } }).catch(() => null);
  await audit(req.userId, "decision.delete", "decision", req.params.id);
  res.status(204).end();
});

// ============================================================
// 8. DOCUMENTS (metadata; upload de arquivo pode reusar /uploads existente)
// ============================================================
const docSchema = z.object({
  title: z.string().min(1),
  kind: z.enum(["policy", "procedure", "flow", "material", "video", "pdf", "link", "other"]).default("other"),
  url: z.string().url().optional().nullable(),
  mime: z.string().optional().nullable(),
  size: z.number().int().optional().nullable(),
  scope: z.enum(["org", "branch", "area", "team"]).default("area"),
  scopeId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).default([]),
  description: z.string().optional().nullable(),
});

organizationRouter.get("/:orgId/documents", async (req, res) => {
  const scope = req.query.scope as string | undefined;
  const scopeId = req.query.scopeId as string | undefined;
  const docs = await prisma.orgDocument.findMany({
    where: {
      organizationId: req.params.orgId,
      ...(scope ? { scope: scope as never } : {}),
      ...(scopeId ? { scopeId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(docs);
});

organizationRouter.post("/:orgId/documents", async (req, res) => {
  try {
    const data = docSchema.parse(req.body);
    const d = await prisma.orgDocument.create({
      data: { ...data, organizationId: req.params.orgId, uploadedBy: req.userId },
    });
    await audit(req.userId, "document.create", "document", d.id);
    res.status(201).json(d);
  } catch (err) { badReq(res, err); }
});

organizationRouter.delete("/:orgId/documents/:id", async (req, res) => {
  const existing = await findDocumentInOrg(req.params.orgId, req.params.id);
  if (!existing) return res.status(404).json({ error: "Documento não encontrado" });
  await prisma.orgDocument.delete({ where: { id: req.params.id } }).catch(() => null);
  await audit(req.userId, "document.delete", "document", req.params.id);
  res.status(204).end();
});

// ============================================================
// 9. AGENDA — visão agregada (rituais planejados + delegações + decisões)
// ============================================================
organizationRouter.get("/:orgId/agenda", async (req, res) => {
  const range = (req.query.range as string) || "week";
  const now = new Date();
  const days = range === "day" ? 1 : range === "month" ? 30 : 7;
  const until = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

  const [occurrences, delegations, decisions, agreements] = await Promise.all([
    prisma.ritualOccurrence.findMany({
      where: {
        ritual: { organizationId: req.params.orgId },
        scheduledAt: { gte: now, lte: until },
      },
      include: { ritual: { select: { name: true, type: true, durationMin: true } } },
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.delegation.findMany({
      where: {
        organizationId: req.params.orgId,
        dueAt: { gte: now, lte: until },
        status: { notIn: ["done", "canceled"] },
      },
      orderBy: { dueAt: "asc" },
    }),
    prisma.decision.findMany({
      where: {
        organizationId: req.params.orgId,
        dueAt: { gte: now, lte: until },
        status: { notIn: ["done", "reverted"] },
      },
      orderBy: { dueAt: "asc" },
    }),
    prisma.teamAgreement.findMany({
      where: {
        organizationId: req.params.orgId,
        dueAt: { gte: now, lte: until },
      },
      orderBy: { dueAt: "asc" },
    }),
  ]);

  const entries = [
    ...occurrences.map((o) => ({
      kind: "ritual" as const,
      id: o.id,
      at: o.scheduledAt,
      title: o.ritual.name,
      subtitle: o.ritual.type,
      duration: o.ritual.durationMin,
      status: o.status,
    })),
    ...delegations.map((d) => ({
      kind: "delegation" as const,
      id: d.id,
      at: d.dueAt!,
      title: d.title,
      subtitle: `Prioridade ${d.priority}`,
      status: d.status,
    })),
    ...decisions.map((d) => ({
      kind: "decision" as const,
      id: d.id,
      at: d.dueAt!,
      title: d.title,
      subtitle: "Decisão pendente",
      status: d.status,
    })),
    ...agreements.map((a) => ({
      kind: "agreement" as const,
      id: a.id,
      at: a.dueAt!,
      title: a.text,
      subtitle: a.kind === "comportamento" ? "Acordo · Comportamento" : "Acordo · Entrega",
      status: a.dueAt && a.dueAt < now ? "overdue" : "pending",
    })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  res.json({ range, from: now, until, entries });
});

// ============================================================
// 10. HEALTH SCORE — cálculo on-demand
// ============================================================
organizationRouter.get("/:orgId/health-score", async (req, res) => {
  const orgId = req.params.orgId;
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [areas, teams, rituals, occurrences, delegations, allDelegations] = await Promise.all([
    prisma.area.findMany({ where: { organizationId: orgId } }),
    prisma.team.findMany({ where: { organizationId: orgId } }),
    prisma.ritual.count({ where: { organizationId: orgId, status: "active" } }),
    prisma.ritualOccurrence.findMany({
      where: { ritual: { organizationId: orgId }, scheduledAt: { gte: since30 } },
      select: { status: true },
    }),
    prisma.delegation.findMany({
      where: { organizationId: orgId, status: { notIn: ["done", "canceled"] } },
      select: { dueAt: true },
    }),
    prisma.delegation.count({ where: { organizationId: orgId } }),
  ]);

  // Estrutura (15%)
  const totalStruct = areas.length + teams.length;
  const okStruct =
    areas.filter((a) => a.mission && a.kpis.length && a.managerUserId).length +
    teams.filter((t) => t.mission && t.kpis.length && t.leaderMembershipId).length;
  const scoreStruct = totalStruct ? okStruct / totalStruct : 0.5;

  // Rituais (25%)
  const done = occurrences.filter((o) => o.status === "done").length;
  const planned = occurrences.length;
  const scoreRituals = planned ? done / planned : rituals > 0 ? 0.5 : 0;

  // Delegações (20%)
  const now = Date.now();
  const overdue = delegations.filter((d) => d.dueAt && d.dueAt.getTime() < now).length;
  const scoreDeleg = delegations.length ? 1 - overdue / delegations.length : allDelegations > 0 ? 0.7 : 0;

  // Indicadores (15%) — placeholder até integração
  const scoreKpis = areas.filter((a) => a.kpis.length).length / Math.max(1, areas.length);

  // Atualização (10%)
  const days = (dt: Date) => (Date.now() - dt.getTime()) / (24 * 60 * 60 * 1000);
  const avgDays = [...areas, ...teams].reduce((s, e) => s + days(e.updatedAt), 0) / Math.max(1, areas.length + teams.length);
  const scoreUpd = Math.max(0, 1 - avgDays / 30);

  // Pendências (15%) — proxy: 1 - overdue/planned
  const scorePend = planned ? 1 - Math.max(0, planned - done) / planned : 0.5;

  const breakdown = {
    estrutura: { weight: 0.15, score: round2(scoreStruct) },
    rituais: { weight: 0.25, score: round2(scoreRituals) },
    delegacoes: { weight: 0.2, score: round2(scoreDeleg) },
    indicadores: { weight: 0.15, score: round2(scoreKpis) },
    atualizacao: { weight: 0.1, score: round2(scoreUpd) },
    pendencias: { weight: 0.15, score: round2(scorePend) },
  };
  const total = Object.values(breakdown).reduce((s, v) => s + v.weight * v.score, 0);
  const score = Math.round(total * 100);

  res.json({ score, breakdown, computedAt: new Date() });
});

function round2(n: number) { return Math.round(n * 100) / 100; }

// ============================================================
// 11. DASHBOARD — resumo consolidado
// ============================================================
organizationRouter.get("/:orgId/dashboard", async (req, res) => {
  const orgId = req.params.orgId;
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [
    ritualsCount,
    upcomingOccurrences,
    overdueDelegations,
    openDecisions,
    docsCount,
    areasCount,
    teamsCount,
  ] = await Promise.all([
    prisma.ritual.count({ where: { organizationId: orgId, status: "active" } }),
    prisma.ritualOccurrence.findMany({
      where: {
        ritual: { organizationId: orgId },
        scheduledAt: { gte: now, lte: in7 },
        status: "scheduled",
      },
      include: { ritual: { select: { name: true, type: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 6,
    }),
    prisma.delegation.count({
      where: {
        organizationId: orgId,
        status: { notIn: ["done", "canceled"] },
        dueAt: { lt: now },
      },
    }),
    prisma.decision.count({
      where: { organizationId: orgId, status: { in: ["open", "in_progress"] } },
    }),
    prisma.orgDocument.count({ where: { organizationId: orgId } }),
    prisma.area.count({ where: { organizationId: orgId } }),
    prisma.team.count({ where: { organizationId: orgId } }),
  ]);

  res.json({
    ritualsCount,
    upcomingOccurrences,
    overdueDelegations,
    openDecisions,
    docsCount,
    areasCount,
    teamsCount,
  });
});

// ============================================================
// 12. LEADERSHIP ROOM — visão de comando pessoal do líder
// ============================================================
organizationRouter.get("/:orgId/leadership-room", async (req, res) => {
  const orgId = req.params.orgId;
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    memberships,
    upcomingOccurrences,
    lastOccurrences,
    delegations,
    decisions,
    ritualsActive,
    areas,
    teams,
  ] = await Promise.all([
    prisma.membership.findMany({
      where: { organizationId: orgId },
      include: { user: { include: { profile: true } } },
      take: 200,
    }),
    prisma.ritualOccurrence.findMany({
      where: {
        ritual: { organizationId: orgId },
        scheduledAt: { gte: now, lte: in7 },
      },
      include: { ritual: { select: { name: true, type: true } } },
      orderBy: { scheduledAt: "asc" },
      take: 12,
    }),
    prisma.ritualOccurrence.findMany({
      where: {
        ritual: { organizationId: orgId },
        scheduledAt: { gte: since30, lt: now },
      },
      select: { status: true },
    }),
    prisma.delegation.findMany({
      where: { organizationId: orgId, status: { notIn: ["done", "canceled"] } },
      orderBy: [{ dueAt: "asc" }],
      take: 20,
    }),
    prisma.decision.findMany({
      where: { organizationId: orgId },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.ritual.count({ where: { organizationId: orgId, status: "active" } }),
    prisma.area.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, updatedAt: true, mission: true, kpis: true, managerUserId: true } }),
    prisma.team.findMany({ where: { organizationId: orgId }, select: { id: true, name: true, updatedAt: true, mission: true, kpis: true, leaderMembershipId: true } }),
  ]);

  // Pessoas que precisam de atenção — heurísticas
  const attention = memberships.slice(0, 30).map((m) => {
    const daysSinceUpdate = Math.floor((now.getTime() - (m.user.updatedAt?.getTime() ?? now.getTime())) / 86400000);
    const name = m.user.profile?.fullName || m.user.email;
    const signals: Array<{ kind: string; reason: string; severity: "high" | "medium" | "low"; action: string }> = [];
    if (daysSinceUpdate > 30) signals.push({ kind: "one_on_one", reason: `Sem 1:1 há ${daysSinceUpdate} dias`, severity: daysSinceUpdate > 45 ? "high" : "medium", action: "Agendar 1:1" });
    return { userId: m.userId, membershipId: m.id, name, avatarUrl: m.user.profile?.avatarUrl ?? null, signals };
  }).filter((p) => p.signals.length > 0).sort((a, b) => {
    const rank = { high: 0, medium: 1, low: 2 } as const;
    return rank[a.signals[0].severity] - rank[b.signals[0].severity];
  }).slice(0, 8);

  // Delegações
  const overdue = delegations.filter((d) => d.dueAt && d.dueAt < now);
  const upcomingDeleg = delegations.filter((d) => !d.dueAt || d.dueAt >= now).slice(0, 6);

  // Rituais
  const done = lastOccurrences.filter((o) => o.status === "done").length;
  const missed = lastOccurrences.filter((o) => o.status === "missed").length;
  const planned = lastOccurrences.length;
  const adherence = planned ? Math.round((done / planned) * 100) : null;

  // Decisões
  const openDecisions = decisions.filter((d) => d.status === "open" || d.status === "in_progress");

  // Próxima melhor ação
  let nextBestAction: { title: string; description: string; cta: string; href: string } | null = null;
  if (overdue[0]) {
    nextBestAction = {
      title: "Retome a delegação atrasada",
      description: `"${overdue[0].title}" está fora do prazo. Alinhe status e novo compromisso.`,
      cta: "Abrir delegação",
      href: "/app/organization/delegations",
    };
  } else if (attention[0]) {
    nextBestAction = {
      title: `Converse com ${attention[0].name}`,
      description: attention[0].signals[0].reason + ". Um 1:1 curto recoloca o combinado.",
      cta: "Agendar 1:1",
      href: "/app/one-on-ones",
    };
  } else if (upcomingOccurrences[0]) {
    nextBestAction = {
      title: `Prepare-se para ${upcomingOccurrences[0].ritual.name}`,
      description: `Próximo ritual em ${new Date(upcomingOccurrences[0].scheduledAt).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}.`,
      cta: "Ver pauta",
      href: "/app/organization/rituals",
    };
  } else {
    nextBestAction = {
      title: "Configure sua sala de liderança",
      description: "Cadastre áreas, equipes e rituais para começar a receber recomendações da IA.",
      cta: "Ir para Organização",
      href: "/app/organization",
    };
  }

  res.json({
    generatedAt: now,
    attention,
    upcomingOccurrences,
    rituals: { active: ritualsActive, done, missed, planned, adherence },
    delegations: {
      overdue: overdue.slice(0, 6).map((d) => ({ id: d.id, title: d.title, dueAt: d.dueAt, priority: d.priority, status: d.status })),
      upcoming: upcomingDeleg.map((d) => ({ id: d.id, title: d.title, dueAt: d.dueAt, priority: d.priority, status: d.status })),
      overdueCount: overdue.length,
    },
    decisions: {
      recent: decisions.slice(0, 5).map((d) => ({ id: d.id, title: d.title, status: d.status, dueAt: d.dueAt, updatedAt: d.updatedAt })),
      openCount: openDecisions.length,
    },
    structure: {
      areas: areas.length,
      teams: teams.length,
      peopleCount: memberships.length,
    },
    nextBestAction,
  });
});

// ============================================================
// 13. LEADERSHIP SIGNALS — sinais cruzados (indicadores + concentração)
// ============================================================
organizationRouter.get("/:orgId/leadership-signals", async (req, res) => {
  const orgId = req.params.orgId;
  const [{ signals, concentration }] = await Promise.all([
    computeIndicatorSignals(orgId),
    computeCrossSignals(orgId).catch(() => ({ created: [] })),
  ]);
  const cross = await prisma.crossSignal.findMany({
    where: { organizationId: orgId, dismissedAt: null },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const crossSignals = cross.map((c) => ({
    id: c.id,
    kind: c.kind,
    severity: c.severity,
    title: c.title,
    detail: c.detail,
    userId: c.userId,
  }));
  res.json({ signals, concentration, crossSignals });
});
