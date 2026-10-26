import { Router, type Response } from "express";
import { z } from "zod";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { env } from "../env.js";
import { randomBytes } from "node:crypto";
import { prisma } from "../prisma.js";
import type { Prisma } from "@prisma/client";
import { requireAuth } from "../auth.js";
import { notifyInApp } from "../lib/notifications.js";
import { completeChat } from "../lib/ai-gateway.js";
import {
  NR1_FACTORS,
  NR1_FACTOR_SUGGESTIONS,
  NR1_MIN_RESPONSES,
  NR1_QUESTIONS,
  NR1_QUESTION_IDS,
  nr1FactorResults,
  nr1Message,
  nr1QuestionTabulation,
  type NR1Answers,
} from "../lib/nr1-instrument.js";
import { toCsv } from "../lib/csv.js";
import {
  NR1_FACTOR_TARGET,
  NR1_INDICATOR_TAG,
  nr1FactorHistory,
  nr1IndicatorName,
  nr1IndicatorSnapshot,
} from "../lib/nr1-indicators.js";
import { resolveUserFeatures } from "./feature-templates.routes.js";

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
/**
 * Papel do usuário na organização. Usado para decidir quem pode criar
 * rodadas, disparar a análise de IA, gerenciar ações e ver denúncias.
 * `null` = sem vínculo (bloqueado).
 */
async function orgRole(userId: string, orgId: string) {
  if (await isSuper(userId)) return "super_admin" as const;
  const m = await prisma.membership.findFirst({
    where: { userId, organizationId: orgId },
    select: { role: true },
  });
  return m?.role ?? null;
}
/** Quem pode conduzir o ciclo NR-1: RH, responsável e líderes da equipe. */
const NR1_MANAGER_ROLES = [
  "super_admin",
  "neo_admin",
  "hr_admin",
  "franchise_owner",
  "leader",
] as const;
async function canManageNr1(userId: string, orgId: string) {
  const role = await orgRole(userId, orgId);
  return !!role && NR1_MANAGER_ROLES.includes(role as (typeof NR1_MANAGER_ROLES)[number]);
}

/**
 * Confere que equipe, responsável e análise de fator pertencem à mesma
 * organização — sem isso, um id vindo do cliente apontaria a ação para
 * registros de outra empresa.
 */
async function validateActionLinks(
  orgId: string,
  links: {
    teamId?: string | null;
    responsibleUserId?: string | null;
    factorAnalysisId?: string | null;
  },
) {
  if (links.teamId) {
    const team = await prisma.team.findFirst({
      where: { id: links.teamId, organizationId: orgId },
      select: { id: true },
    });
    if (!team) return { error: "A equipe informada não pertence a esta organização." };
  }
  if (links.responsibleUserId) {
    const member = await prisma.membership.findFirst({
      where: { userId: links.responsibleUserId, organizationId: orgId },
      select: { id: true },
    });
    if (!member) return { error: "O responsável informado não pertence a esta organização." };
  }
  if (links.factorAnalysisId) {
    const analysis = await prisma.nR1FactorAnalysis.findFirst({
      where: { id: links.factorAnalysisId, survey: { organizationId: orgId } },
      select: { id: true, surveyId: true },
    });
    if (!analysis)
      return { error: "A análise de fator informada não pertence a esta organização." };
    return { analysis };
  }
  return {};
}
async function isExec(userId: string, orgId: string) {
  if (await isSuper(userId)) return true;
  const m = await prisma.membership.findFirst({
    where: { userId, organizationId: orgId, role: { in: ["hr_admin", "franchise_owner"] } },
  });
  return !!m;
}

async function getManagedTeamIds(userId: string, orgId: string) {
  const role = await orgRole(userId, orgId);
  if (role === "hr_admin" || role === "franchise_owner") return null;
  if (await isSuper(userId)) return null;
  if (role !== "leader") return null;

  const memberships = await prisma.membership.findMany({
    where: { userId, organizationId: orgId },
    select: { id: true, teamId: true },
  });

  const teamIds = new Set<string>();
  for (const m of memberships) {
    if (m.teamId) teamIds.add(m.teamId);
  }

  const teams = await prisma.team.findMany({
    where: { organizationId: orgId },
    select: { id: true, responsibleUserId: true, leaderMembershipId: true },
  });

  for (const t of teams) {
    if (t.responsibleUserId === userId) teamIds.add(t.id);
    const m = memberships.find((mm) => mm.id === t.leaderMembershipId);
    if (m) teamIds.add(t.id);
  }

  return teamIds.size > 0 ? Array.from(teamIds) : [];
}
/**
 * O módulo NR-1 está ligado para este usuário? Super/neo admin não dependem
 * de template. Para os demais, basta qualquer feature `nr1.*` habilitada no
 * papel — o template é a fonte de verdade do que a organização liberou.
 */
async function hasNr1Module(userId: string) {
  if (await isSuper(userId)) return true;
  const { features } = await resolveUserFeatures(userId);
  return Object.keys(features).some(
    (key) => key.startsWith("nr1.") && Object.values(features[key] ?? {}).some(Boolean),
  );
}
async function notifyAuthorizedLeaders(orgId: string, title: string, body: string) {
  const leaders = await prisma.membership.findMany({
    where: { organizationId: orgId, role: { in: ["hr_admin", "franchise_owner"] } },
    select: { userId: true },
  });
  // Super/neo admins são executivos da plataforma e também precisam receber
  // a denúncia — antes ficavam de fora por não terem membership na org.
  const admins = await prisma.userRole.findMany({
    where: { role: { in: ["super_admin", "neo_admin"] } },
    select: { userId: true },
  });
  const recipients = Array.from(
    new Map([...leaders, ...admins].map((l) => [l.userId, l])).values(),
  );
  await Promise.all(
    recipients.map((l) =>
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
  /**
   * O módulo NR-1 é uma ferramenta de gestão de riscos: quem o opera precisa
   * ser capaz de conduzir o ciclo (RH, responsável da organização ou líder de
   * equipe). Colaboradores respondem pela rota pública com token, sem login,
   * e não devem alcançar o console — nem os resultados agregados, nem as
   * ações, nem as denúncias. Sem esta trava, qualquer membro da organização
   * com uma sessão válida veria a lista de denúncias e as ações de risco.
   */
  if (!(await canManageNr1(req.userId!, orgId)))
    return res.status(403).json({
      error: "Acesso restrito a RH, responsáveis e líderes de equipe.",
    });
  /**
   * Gate de módulo: o NR-1 também é uma feature do catálogo, com o template
   * de cada papel definindo o que está liberado. O menu já esconde a entrada
   * quando o módulo não está habilitado — sem esta trava no servidor, bastaria
   * digitar a URL para entrar mesmo com o módulo desligado.
   */
  if (!(await hasNr1Module(req.userId!)))
    return res.status(403).json({ error: "Módulo NR-1 não habilitado para este usuário." });
  next();
});

const ACTION_ORIGINS = [
  "core_assessment",
  "risk_inventory",
  "existing_action_plan",
  "external_assessment",
  "leader_identification",
  "guided_conversation",
  "other",
] as const;
const ACTION_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "overdue",
  "cancelled",
] as const;
const ACTION_KNOWLEDGE = ["known", "partial", "unsure"] as const;
const ACTION_OUTCOMES = [
  "improved",
  "partially_improved",
  "unchanged",
  "worsened",
  "not_assessable",
] as const;
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
  knowledgeLevel: z.enum(ACTION_KNOWLEDGE).default("known"),
  sourceRef: z.string().max(300).optional().nullable(),
});
const actionUpdateSchema = actionSchema.partial().omit({ origin: true });
const actionProgressSchema = z.object({
  kind: z.enum(["progress", "impediment", "adjustment", "conclusion"]),
  note: z.string().min(2).max(2000),
});

function actionDate(value: string | null | undefined) {
  return value ? new Date(value) : null;
}
/**
 * Chave de comparação de situações para detecção de duplicadas: sem
 * acento, sem caixa e sem espaços extras, para que "Assédio" e "assedio "
 * não virem duas ações diferentes.
 */
function situationKey(text: string) {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}
function appendHistory(history: unknown, event: string, userId: string, note?: string) {
  const current = Array.isArray(history) ? history : [];
  return [
    ...current,
    { event, at: new Date().toISOString(), by: userId, ...(note ? { note } : {}) },
  ];
}

/**
 * Sincroniza uma ação NR-1 com a Agenda do Líder (LeaderAgendaItem).
 * A ação existe uma única vez no sistema — a agenda apenas referencia.
 * Usa agendaItemId para rastrear o item; fallback: busca por título+source.
 */
async function syncActionToAgenda(
  action: {
    id: string;
    situation: string;
    description: string;
    dueDate: Date | null;
    status: string;
    responsibleLabel: string | null;
    agendaItemId: string | null;
  },
  orgId: string,
  userId: string,
) {
  const done = action.status === "completed" || action.status === "cancelled";

  // Se já tem agendaItemId, atualiza diretamente
  if (action.agendaItemId) {
    await prisma.leaderAgendaItem.update({
      where: { id: action.agendaItemId },
      data: {
        title: action.situation,
        detail: action.description,
        kind: "acao",
        scheduledAt: action.dueDate,
        done,
        memberLabel: action.responsibleLabel,
      },
    });
    return;
  }

  // Fallback: busca por título + source nr1
  const existing = await prisma.leaderAgendaItem.findFirst({
    where: { organizationId: orgId, userId, title: action.situation, source: "nr1" },
  });

  if (existing) {
    await prisma.leaderAgendaItem.update({
      where: { id: existing.id },
      data: {
        detail: action.description,
        kind: "acao",
        scheduledAt: action.dueDate,
        done,
        memberLabel: action.responsibleLabel,
      },
    });
    // Atualiza o agendaItemId na ação para futuras sincronizações
    await prisma.nR1Action.update({
      where: { id: action.id },
      data: { agendaItemId: existing.id },
    });
  } else {
    const created = await prisma.leaderAgendaItem.create({
      data: {
        organizationId: orgId,
        userId,
        title: action.situation,
        detail: action.description,
        kind: "acao",
        scheduledAt: action.dueDate,
        done,
        memberLabel: action.responsibleLabel,
        source: "nr1",
      },
    });
    await prisma.nR1Action.update({
      where: { id: action.id },
      data: { agendaItemId: created.id },
    });
  }
}

/** Remove o item da agenda correspondente a uma ação NR-1 (se existir). */
async function removeActionFromAgenda(
  action: { situation: string; agendaItemId: string | null },
  orgId: string,
  userId: string,
) {
  if (action.agendaItemId) {
    await prisma.leaderAgendaItem.deleteMany({
      where: { id: action.agendaItemId, organizationId: orgId, userId },
    });
    return;
  }
  // Fallback: busca por título + source nr1
  await prisma.leaderAgendaItem.deleteMany({
    where: { organizationId: orgId, userId, title: action.situation, source: "nr1" },
  });
}

const NR1_EVIDENCE_MIME = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
]);
/**
 * Confere os bytes do arquivo, não só o Content-Type declarado pelo cliente
 * (que é trivialmente falsificável). Formatos ativos como HTML/SVG não são
 * aceitos — no máximo o MIME declarado precisa bater com a assinatura.
 */
const NR1_EVIDENCE_SIGNATURES: Array<{ mime: string; test: (buf: Buffer) => boolean }> = [
  { mime: "application/pdf", test: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  {
    mime: "image/png",
    test: (b) =>
      b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { mime: "image/jpeg", test: (b) => b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) },
  {
    mime: "image/webp",
    test: (b) =>
      b.subarray(0, 4).toString("latin1") === "RIFF" &&
      b.subarray(8, 12).toString("latin1") === "WEBP",
  },
  {
    mime: "text/plain",
    test: (b) => {
      // Texto simples: sem bytes de controle exceto tab/newline/CR.
      const sample = b.subarray(0, 4096);
      for (const byte of sample) {
        if (byte === 0) return false;
        if (byte < 9 || (byte > 13 && byte < 32)) return false;
      }
      return true;
    },
  },
];
function matchesEvidenceSignature(buf: Buffer, mime: string) {
  const rule = NR1_EVIDENCE_SIGNATURES.find((s) => s.mime === mime);
  if (!rule) return false;
  return rule.test(buf);
}
/** Remove o arquivo gravado pelo multer quando o pedido é rejeitado depois. */
function discardUploadedFile(filename?: string) {
  if (!filename) return;
  try {
    fs.unlinkSync(path.join(env.UPLOADS_DIR, "nr1-evidence", filename));
  } catch {
    // arquivo já não existe — nada a fazer
  }
}
const nr1EvidenceUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      const dir = path.join(env.UPLOADS_DIR, "nr1-evidence");
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().slice(0, 10);
      cb(
        null,
        `${Date.now()}-${randomBytes(12).toString("hex")}${/^\\.[a-z0-9]+$/.test(ext) ? ext : ".bin"}`,
      );
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!NR1_EVIDENCE_MIME.has(file.mimetype))
      return cb(new Error("Formato não suportado. Use PDF, imagem ou TXT."));
    cb(null, true);
  },
});

nr1Router.post("/:orgId/nr1/actions/:id/evidence", (req, res) => {
  nr1EvidenceUpload.single("file")(req, res, async (err) => {
    if (err) {
      discardUploadedFile(req.file?.filename);
      return res.status(400).json({ error: err.message });
    }
    if (!req.file) return res.status(400).json({ error: "Arquivo ausente." });
    try {
      const head = Buffer.alloc(4096);
      const fd = fs.openSync(req.file.path, "r");
      const read = fs.readSync(fd, head, 0, head.length, 0);
      fs.closeSync(fd);
      if (!matchesEvidenceSignature(head.subarray(0, read), req.file.mimetype)) {
        discardUploadedFile(req.file.filename);
        return res
          .status(400)
          .json({ error: "O conteúdo do arquivo não corresponde ao formato informado." });
      }
      const action = await prisma.nR1Action.findFirst({
        where: { id: req.params.id, organizationId: req.params.orgId },
      });
      if (!action) {
        discardUploadedFile(req.file.filename);
        return res.status(404).json({ error: "Ação não encontrada." });
      }
      const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
      if (managedTeamIds !== null) {
        if (!action.teamId || !managedTeamIds.includes(action.teamId)) {
          discardUploadedFile(req.file.filename);
          return res.status(403).json({ error: "Ação fora de sua equipe." });
        }
      }
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
      const updated = await prisma.nR1Action.update({
        where: { id: action.id },
        data: { evidence: [...evidence, item], updatedBy: req.userId! },
      });
      res.status(201).json({ evidence: item, action: updated });
    } catch (e) {
      discardUploadedFile(req.file?.filename);
      badReq(res, e);
    }
  });
});

nr1Router.get("/:orgId/nr1/actions", async (req, res) => {
  try {
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    if (status && !ACTION_STATUSES.includes(status as (typeof ACTION_STATUSES)[number])) {
      return res.status(400).json({ error: "Status inválido." });
    }
    // "Atrasada" é um estado derivado do prazo, não um valor gravado: uma
    // ação vencida e não concluída aparece no filtro mesmo sem status
    // "overdue" no banco.
    const where: Prisma.NR1ActionWhereInput = { organizationId: req.params.orgId };
    const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
    if (managedTeamIds !== null) {
      if (managedTeamIds.length === 0) return res.json([]);
      where.teamId = { in: managedTeamIds };
    }
    if (status === "overdue") {
      where.dueDate = { lt: new Date() };
      where.status = { in: ["not_started", "in_progress"] };
    } else if (status) {
      where.status = status as Prisma.EnumNR1ActionStatusFilter["equals"];
    }
    const actions = await prisma.nR1Action.findMany({
      where,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });
    res.json(actions);
  } catch (err) {
    badReq(res, err);
  }
});

// Origens aceitas na importação em lote (Marco 02). Só documentos que o líder
// já traz de fora — identificação direta continua sendo "leader_identification".
const IMPORT_ORIGINS = ["risk_inventory", "existing_action_plan"] as const;
const importItemSchema = z.object({
  situation: z.string().min(2).max(500),
  description: z.string().min(2).max(5000),
  factorId: z.string().min(1).max(80).optional().nullable(),
  responsibleLabel: z.string().max(160).optional().nullable(),
  dueDate: z.string().optional().nullable(),
  followUpMethod: z.string().max(1000).optional().nullable(),
});
const importSchema = z.object({
  origin: z.enum(IMPORT_ORIGINS),
  items: z.array(importItemSchema).min(1).max(200),
});

const IMPORT_COLUMNS = [
  "situacao",
  "descricao",
  "fator",
  "responsavel",
  "prazo",
  "acompanhamento",
] as const;

// Template CSV servido pelo backend para o front não manter cópia hardcoded
// que possa divergir do schema acima.
nr1Router.get("/:orgId/nr1/actions/import/template", (_req, res) => {
  const example = [
    {
      situacao: "Excesso de demandas na equipe de campo",
      descricao:
        "Revisar a distribuição de tarefas do turno da manhã e repactuar prazos com a área demandante.",
      fator: "excesso_demandas",
      responsavel: "Coordenação de Operações",
      prazo: "", // AAAA-MM-DD
      acompanhamento: "Reunião mensal de equipe",
    },
  ];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="nr1-modelo-importacao.csv"');
  res.send(toCsv(example, [...IMPORT_COLUMNS]));
});

/**
 * Importação em lote de Inventário de Riscos / Plano de Ação existentes (Marco 02).
 *
 * Valida item a item e não falha em bloco: uma planilha real costuma ter linhas
 * com data inválida ou célula vazia, e impedir as outras 37 por causa de 3 seria
 * inutilizável. A resposta devolve o que entrou e o que ficou de fora e por quê.
 */
nr1Router.post("/:orgId/nr1/actions/import", async (req, res) => {
  try {
    const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
    if (managedTeamIds !== null && managedTeamIds.length === 0) {
      return res.status(403).json({ error: "Sem equipe para importar ações." });
    }
    const data = importSchema.parse(req.body);
    const created: Array<{ id: string; situation: string }> = [];
    const skipped: Array<{ row: number; situation: string; reason: string }> = [];

    for (const [index, item] of data.items.entries()) {
      try {
        // Prazo é texto livre no CSV/JSON: aceita AAAA-MM-DD e descarta o que
        // não for data, em vez de rejeitar a linha inteira.
        let dueDate: Date | null = null;
        if (item.dueDate?.trim()) {
          const parsed = new Date(item.dueDate.trim());
          if (Number.isNaN(parsed.getTime())) {
            throw new Error(`prazo "${item.dueDate}" não é uma data válida`);
          }
          dueDate = parsed;
        }

        const action = await prisma.nR1Action.create({
          data: {
            organizationId: req.params.orgId,
            factorId: item.factorId ?? null,
            origin: data.origin,
            situation: item.situation,
            description: item.description,
            responsibleLabel: item.responsibleLabel ?? null,
            dueDate,
            followUpMethod: item.followUpMethod ?? null,
            history: [
              { event: "created", at: new Date().toISOString(), by: req.userId },
              { event: "imported", at: new Date().toISOString(), by: req.userId, note: data.origin },
            ],
            createdBy: req.userId!,
          },
        });
        // Sincroniza com a Agenda do Líder (não-bloqueante) — mesma ação única
        // das fases anteriores, alcançada agora também pela importação.
        try {
          await syncActionToAgenda(action, req.params.orgId, req.userId!);
        } catch (agendaErr) {
          console.error("[nr1] agenda sync failed on import", agendaErr);
        }
        created.push({ id: action.id, situation: action.situation });
      } catch (err) {
        skipped.push({
          row: index + 1,
          situation: item.situation,
          reason: err instanceof Error ? err.message : String(err),
        });
      }
    }

    res.status(201).json({ created, skipped });
  } catch (err) {
    badReq(res, err);
  }
});

// Sugestões de primeiro passo por fator — alimenta o fluxo "Ainda não sei".
nr1Router.get("/:orgId/nr1/suggestions", (_req, res) => {
  res.json(NR1_FACTOR_SUGGESTIONS);
});

nr1Router.post("/:orgId/nr1/actions", async (req, res) => {
  try {
    const data = actionSchema.parse(req.body);
    if (data.status === "cancelled" && !data.cancelReason?.trim()) {
      return res.status(400).json({ error: "Ações canceladas precisam de justificativa." });
    }

    const linkCheck = await validateActionLinks(req.params.orgId, data);
    if (linkCheck.error) return res.status(400).json({ error: linkCheck.error });

    const orgId = req.params.orgId;
    const managedTeamIds = await getManagedTeamIds(req.userId!, orgId);
    if (managedTeamIds !== null) {
      if (managedTeamIds.length === 0) {
        return res.status(403).json({ error: "Sem equipe para criar ação." });
      }
      if (!data.teamId || !managedTeamIds.includes(data.teamId)) {
        return res.status(403).json({ error: "Ação fora de sua equipe." });
      }
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
        knowledgeLevel: data.knowledgeLevel,
        sourceRef: data.sourceRef ?? null,
        history: [{ event: "created", at: new Date().toISOString(), by: req.userId }],
        createdBy: req.userId!,
      },
    });
    // Sincroniza com a Agenda do Líder (não-bloqueante)
    try {
      await syncActionToAgenda(action, req.params.orgId, req.userId!);
    } catch (agendaErr) {
      console.error("[nr1] agenda sync failed on create", agendaErr);
    }

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
    const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
    if (managedTeamIds !== null) {
      if (!current.teamId || !managedTeamIds.includes(current.teamId)) {
        return res.status(403).json({ error: "Ação fora de sua equipe." });
      }
      if (data.teamId && managedTeamIds.includes(data.teamId) === false) {
        return res.status(403).json({ error: "Não é possível mover para fora de sua equipe." });
      }
    }
    if (data.status === "cancelled" && !data.cancelReason?.trim() && !current.cancelReason) {
      return res.status(400).json({ error: "Ações canceladas precisam de justificativa." });
    }
    // Revalida os vínculos: um id vindo do cliente não pode apontar a ação
    // para uma equipe, responsável ou análise de outra organização.
    const linkCheck = await validateActionLinks(req.params.orgId, {
      ...(data.teamId !== undefined ? { teamId: data.teamId } : {}),
      ...(data.responsibleUserId !== undefined
        ? { responsibleUserId: data.responsibleUserId }
        : {}),
      ...(data.factorAnalysisId !== undefined ? { factorAnalysisId: data.factorAnalysisId } : {}),
    });
    if (linkCheck.error) return res.status(400).json({ error: linkCheck.error });
    if (data.surveyId) {
      const survey = await prisma.nR1Survey.findFirst({
        where: { id: data.surveyId, organizationId: req.params.orgId },
        select: { id: true, teamId: true },
      });
      if (!survey) return res.status(404).json({ error: "Avaliação não encontrada." });
      const targetTeam = data.teamId !== undefined ? data.teamId : current.teamId;
      if (targetTeam && survey.teamId && targetTeam !== survey.teamId) {
        return res.status(400).json({ error: "A equipe não corresponde à avaliação." });
      }
    }
    const action = await prisma.nR1Action.update({
      where: { id: current.id },
      data: {
        ...(data.situation !== undefined ? { situation: data.situation } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.teamId !== undefined ? { teamId: data.teamId ?? null } : {}),
        ...(data.surveyId !== undefined ? { surveyId: data.surveyId ?? null } : {}),
        ...(data.factorId !== undefined ? { factorId: data.factorId ?? null } : {}),
        ...(data.factorAnalysisId !== undefined
          ? { factorAnalysisId: data.factorAnalysisId ?? null }
          : {}),
        ...(data.responsibleUserId !== undefined
          ? { responsibleUserId: data.responsibleUserId ?? null }
          : {}),
        ...(data.responsibleLabel !== undefined
          ? { responsibleLabel: data.responsibleLabel ?? null }
          : {}),
        ...(data.dueDate !== undefined ? { dueDate: actionDate(data.dueDate) } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.followUpMethod !== undefined
          ? { followUpMethod: data.followUpMethod ?? null }
          : {}),
        ...(data.result !== undefined ? { result: data.result ?? null } : {}),
        ...(data.outcome !== undefined ? { outcome: data.outcome ?? null } : {}),
        ...(data.sufficiency !== undefined ? { sufficiency: data.sufficiency ?? null } : {}),
        ...(data.sufficiencyNote !== undefined
          ? { sufficiencyNote: data.sufficiencyNote ?? null }
          : {}),
        ...(data.nextCheckAt !== undefined ? { nextCheckAt: actionDate(data.nextCheckAt) } : {}),
        ...(data.cancelReason !== undefined ? { cancelReason: data.cancelReason ?? null } : {}),
        ...(data.knowledgeLevel !== undefined ? { knowledgeLevel: data.knowledgeLevel } : {}),
        ...(data.sourceRef !== undefined ? { sourceRef: data.sourceRef ?? null } : {}),
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
          data.result ?? data.sufficiencyNote ?? undefined,
        ),
      },
    });
    // Sincroniza com a Agenda do Líder (não-bloqueante)
    try {
      await syncActionToAgenda(action, req.params.orgId, req.userId!);
    } catch (agendaErr) {
      console.error("[nr1] agenda sync failed on update", agendaErr);
    }

    res.json(action);
  } catch (err) {
    badReq(res, err);
  }
});

nr1Router.post("/:orgId/nr1/actions/:id/progress", async (req, res) => {
  try {
    const data = actionProgressSchema.parse(req.body);
    const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
    if (managedTeamIds !== null) {
      const target = await prisma.nR1Action.findFirst({
        where: { id: req.params.id, organizationId: req.params.orgId },
        select: { teamId: true },
      });
      if (!target) return res.status(404).json({ error: "Ação não encontrada." });
      if (!target.teamId || !managedTeamIds.includes(target.teamId)) {
        return res.status(403).json({ error: "Ação fora de sua equipe." });
      }
    }
    // Leitura e gravação do histórico dentro da mesma transação: sem isso,
    // dois registros simultâneos (um progresso e uma evidência, por exemplo)
    // poderiam sobrescrever um ao outro.
    const updated = await prisma.$transaction(async (tx) => {
      const action = await tx.nR1Action.findFirst({
        where: { id: req.params.id, organizationId: req.params.orgId },
      });
      if (!action) return null;
      return tx.nR1Action.update({
        where: { id: action.id },
        data: {
          ...(data.kind === "conclusion" ? { status: "completed" } : {}),
          updatedBy: req.userId!,
          history: appendHistory(action.history, data.kind, req.userId!, data.note),
        },
      });
    });
    if (!updated) return res.status(404).json({ error: "Ação não encontrada." });
    res.json(updated);
  } catch (err) {
    badReq(res, err);
  }
});

nr1Router.delete("/:orgId/nr1/actions/:id", async (req, res) => {
  try {
    const existing = await prisma.nR1Action.findFirst({
      where: { id: req.params.id, organizationId: req.params.orgId },
      select: { situation: true, agendaItemId: true, teamId: true },
    });
    if (!existing) return res.status(404).json({ error: "Ação não encontrada." });
    const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
    if (managedTeamIds !== null) {
      if (!existing.teamId || !managedTeamIds.includes(existing.teamId)) {
        return res.status(403).json({ error: "Ação fora de sua equipe." });
      }
    }

    // Remove o item da agenda vinculado (não-bloqueante)
    try {
      await removeActionFromAgenda(existing, req.params.orgId, req.userId!);
    } catch (agendaErr) {
      console.error("[nr1] agenda sync failed on delete", agendaErr);
    }

    await prisma.nR1Action.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    badReq(res, err);
  }
});

nr1Router.get("/:orgId/nr1/surveys", async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const userId = req.userId!;
    const managedTeamIds = await getManagedTeamIds(userId, orgId);
    const where: Prisma.NR1SurveyWhereInput = { organizationId: orgId };
    if (managedTeamIds !== null) {
      if (managedTeamIds.length === 0) return res.json([]);
      where.teamId = { in: managedTeamIds };
    }
    const surveys = await prisma.nR1Survey.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { responses: true } } },
    });
    const withAvg = await Promise.all(
      surveys.map(async (s) => {
        // Anonimato (Marco 3.5): com menos de 3 respostas não se expõe
        // contagem nem média — só o suficiente para o líder saber que a
        // rodada está aberta.
        const sufficient = s._count.responses >= NR1_MIN_RESPONSES;
        if (!sufficient) {
          return {
            ...s,
            responseCount: null,
            avgScore: null,
            resultAvailable: false,
            insufficientMessage: nr1Message("insufficient"),
          };
        }
        const agg = await prisma.nR1Response.aggregate({
          where: { surveyId: s.id },
          _avg: { riskScore: true },
        });
        return {
          ...s,
          responseCount: s._count.responses,
          avgScore: agg._avg.riskScore,
          resultAvailable: true,
          insufficientMessage: null,
        };
      }),
    );
    res.json(withAvg);
  } catch (err) {
    badReq(res, err);
  }
});

const surveySchema = z.object({
  title: z.string().min(2),
  teamId: z.string().uuid().optional().nullable(),
  comparePrevious: z.boolean().optional().default(true),
});

nr1Router.post("/:orgId/nr1/surveys", async (req, res) => {
  try {
    const data = surveySchema.parse(req.body);
    if (data.teamId) {
      const team = await prisma.team.findFirst({
        where: { id: data.teamId, organizationId: req.params.orgId },
        select: { id: true },
      });
      if (!team)
        return res
          .status(400)
          .json({ error: "A equipe informada não pertence a esta organização." });
    }
    const s = await prisma.nR1Survey.create({
      data: {
        organizationId: req.params.orgId,
        title: data.title,
        teamId: data.teamId ?? null,
        token: genToken(),
        comparePrevious: data.comparePrevious,
        createdBy: req.userId!,
      },
    });
    res.status(201).json(s);
  } catch (err) {
    badReq(res, err);
  }
});

nr1Router.get("/:orgId/nr1/surveys/:id", async (req, res) => {
  try {
    const s = await prisma.nR1Survey.findFirst({
      where: { id: req.params.id, organizationId: req.params.orgId },
      include: {
        responses: { orderBy: { createdAt: "desc" } },
        factorAnalyses: true,
      },
    });
    if (!s) return res.status(404).json({ error: "Pesquisa não encontrada" });
    const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
    if (managedTeamIds !== null) {
      if (!s.teamId || !managedTeamIds.includes(s.teamId)) {
        return res.status(403).json({ error: "Fora de sua equipe." });
      }
    }

    const answersList = s.responses.map((r) => r.answers as NR1Answers);
    // Marco 3.5 — resultados só com o mínimo de respostas válidas (anonimato).
    const insufficient = s.responses.length < NR1_MIN_RESPONSES;
    const factors = insufficient ? [] : nr1FactorResults(answersList);

    // Marco 6.7 — evolução: compara com a rodada anterior da mesma equipe
    // (mesmo teamId) encerrada antes do início desta, ou a anterior sem equipe.
    const previous = s.comparePrevious
      ? await prisma.nR1Survey.findFirst({
          where: {
            organizationId: s.organizationId,
            teamId: s.teamId,
            id: { not: s.id },
            createdAt: { lt: s.createdAt },
            responses: { some: {} },
          },
          orderBy: { createdAt: "desc" },
          include: { responses: true },
        })
      : null;
    let previousFactors: typeof factors = [];
    let previousLabel: string | null = null;
    if (previous && previous.responses.length >= NR1_MIN_RESPONSES) {
      previousFactors = nr1FactorResults(previous.responses.map((r) => r.answers as NR1Answers));
      previousLabel = previous.title;
    }

    res.json({
      ...s,
      // Anonimato: não expõe respostas individuais. Só o total — a data e a
      // hora de cada resposta permitiriam reidentificar o respondente em
      // equipes pequenas.
      responseCount: s.responses.length,
      responses: [],
      tabulation: nr1QuestionTabulation(answersList),
      factors,
      resultAvailable: !insufficient,
      insufficientMessage: insufficient ? nr1Message("insufficient") : null,
      previousLabel,
      previousFactors,
      factorAnalyses: s.factorAnalyses,
      // Análise de IA persistida: sem isso, reabrir a rodada perderia o
      // resultado e o líder teria que pedir ao modelo de novo.
      aiAnalysis: s.aiAnalysis,
    });
  } catch (err) {
    badReq(res, err);
  }
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
      select: { id: true, teamId: true },
    });
    if (!survey) return res.status(404).json({ error: "Pesquisa não encontrada" });
    const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
    if (managedTeamIds !== null) {
      if (!survey.teamId || !managedTeamIds.includes(survey.teamId)) {
        return res.status(403).json({ error: "Fora de sua equipe." });
      }
    }

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
  const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
  if (managedTeamIds !== null) {
    if (!survey.teamId || !managedTeamIds.includes(survey.teamId)) {
      return res.status(403).json({ error: "Fora de sua equipe." });
    }
  }
  if (survey.responses.length < NR1_MIN_RESPONSES) {
    return res.status(400).json({
      error: `São necessárias pelo menos ${NR1_MIN_RESPONSES} respostas para proteger o anonimato e gerar a análise.`,
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
            scale:
              "1 a 5; percentual = ((média − 1) ÷ 4) × 100; menor percentual representa maior atenção",
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
    if (start === -1 || end < start) {
      return res
        .status(502)
        .json({ error: "A análise retornada pelo modelo não estava em formato JSON." });
    }
    const parsed = aiAnalysisSchema.parse(JSON.parse(cleaned.slice(start, end + 1)));
    const generatedAt = new Date().toISOString();
    // Persiste para que a análise não se perca ao fechar o diálogo.
    await prisma.nR1Survey.update({
      where: { id: survey.id },
      data: { aiAnalysis: { ...parsed, generatedAt } },
    });
    res.json({ ...parsed, generatedAt });
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
  archived: z.boolean().optional(),
});

nr1Router.patch("/:orgId/nr1/surveys/:id", async (req, res) => {
  try {
    const data = surveyUpdateSchema.parse(req.body);
    const target = await prisma.nR1Survey.findFirst({
      where: { id: req.params.id, organizationId: req.params.orgId },
      select: { id: true, teamId: true },
    });
    if (!target) return res.status(404).json({ error: "Pesquisa não encontrada" });
    const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
    if (managedTeamIds !== null) {
      if (!target.teamId || !managedTeamIds.includes(target.teamId)) {
        return res.status(403).json({ error: "Fora de sua equipe." });
      }
    }
    const result = await prisma.nR1Survey.updateMany({
      where: { id: req.params.id, organizationId: req.params.orgId },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.status !== undefined
          ? { status: data.status, closedAt: data.status === "closed" ? new Date() : null }
          : {}),
        ...(data.actionPlan !== undefined ? { actionPlan: data.actionPlan ?? null } : {}),
        ...(data.archived !== undefined
          ? {
              archivedAt: data.archived ? new Date() : null,
              ...(data.archived ? { status: "closed" as const } : {}),
            }
          : {}),
      },
    });
    if (!result.count) return res.status(404).json({ error: "Pesquisa não encontrada" });
    // Encerrar a rodada é o momento em que o resultado passa a contar: o
    // indicador do Módulo R passa a refletir a rodada nova.
    if (data.status === "closed") {
      try {
        await syncNr1ToIndicators(req.params.orgId, req.userId!);
      } catch (syncErr) {
        console.error("[nr1] falha ao sincronizar indicadores", syncErr);
      }
    }
    const survey = await prisma.nR1Survey.findUnique({ where: { id: req.params.id } });
    res.json(survey);
  } catch (err) {
    badReq(res, err);
  }
});

/**
 * "Nada é excluído" (regra transversal do módulo): rodadas encerradas são
 * arquivadas, nunca apagadas em cascata — apagar levaria junto as respostas
 * e destruiria o histórico de evolução entre ciclos.
 */
nr1Router.delete("/:orgId/nr1/surveys/:id", async (req, res) => {
  try {
    const target = await prisma.nR1Survey.findFirst({
      where: { id: req.params.id, organizationId: req.params.orgId },
      select: { id: true, teamId: true },
    });
    if (!target) return res.status(404).json({ error: "Pesquisa não encontrada" });
    const managedTeamIds = await getManagedTeamIds(req.userId!, req.params.orgId);
    if (managedTeamIds !== null) {
      if (!target.teamId || !managedTeamIds.includes(target.teamId)) {
        return res.status(403).json({ error: "Fora de sua equipe." });
      }
    }
    const result = await prisma.nR1Survey.updateMany({
      where: { id: req.params.id, organizationId: req.params.orgId },
      data: { archivedAt: new Date(), status: "closed" },
    });
    if (!result.count) return res.status(404).json({ error: "Pesquisa não encontrada" });
    res.status(204).end();
  } catch (err) {
    badReq(res, err);
  }
});

// ============================================================
// Indicadores NR-1 (item 5 da auditoria) — o resultado do
// diagnóstico vira série de indicadores do Módulo R.
// ============================================================

/**
 * Sincroniza o resultado do NR-1 com o Módulo R.
 *
 * O Módulo R é onde a organização acompanha meta, farol e histórico. Se o
 * NR-1 não alimentá-lo, os 13 fatores continuam visíveis só dentro da tela
 * do diagnóstico — sem farol, sem meta, sem comparação com outras áreas.
 *
 * Cada fator vira um indicador `NR1 · <fator>`, com meta 75% (faixa
 * favorável do NR-1) e uma leitura por rodada encerrada. Rodadas com menos
 * de `NR1_MIN_RESPONSES` não viram leitura: sem o mínimo de respostas o
 * agregado não pode ser exposto, e um indicador alimentado por número
 * pequeno seria a mesma quebra de anonimato com outro nome.
 */
async function syncNr1ToIndicators(orgId: string, userId: string) {
  const surveys = await prisma.nR1Survey.findMany({
    where: { organizationId: orgId },
    orderBy: { createdAt: "desc" },
    include: { responses: true },
  });
  const inputs = surveys.map((s) => ({
    id: s.id,
    title: s.title,
    teamId: s.teamId,
    createdAt: s.createdAt,
    answers: s.responses.map((r) => r.answers as NR1Answers),
  }));

  // Uma leitura por rodada: é a série que dá linha de tempo ao indicador.
  const history = nr1FactorHistory(inputs);
  if (history.length === 0) return;

  // O `Indicator` não tem unique por (org, nome) no schema — só por id. Para
  // reusar o mesmo indicador entre rodadas, casamos pelo par org+nome.
  const byName = new Map<string, string>();
  for (const factorName of new Set(history.map((p) => p.factorName))) {
    const name = nr1IndicatorName(factorName);
    const existing = await prisma.indicator.findFirst({
      where: { organizationId: orgId, name },
      select: { id: true },
    });
    if (existing) {
      byName.set(factorName, existing.id);
      continue;
    }
    const created = await prisma.indicator.create({
      data: {
        organizationId: orgId,
        level: "team",
        name,
        description: `Percentual do fator "${factorName}" no diagnóstico NR-1 (meta ${NR1_FACTOR_TARGET}% = faixa favorável).`,
        unit: "%",
        direction: "higher_better",
        target: NR1_FACTOR_TARGET,
        tags: [NR1_INDICATOR_TAG],
        createdBy: userId,
        updatedBy: userId,
      },
      select: { id: true },
    });
    byName.set(factorName, created.id);
  }

  for (const point of history) {
    const indicatorId = byName.get(point.factorName);
    if (!indicatorId) continue;
    await prisma.indicatorReading.upsert({
      where: {
        indicatorId_periodYear_periodMonth: {
          indicatorId,
          periodYear: point.periodYear,
          periodMonth: point.periodMonth,
        },
      },
      update: { value: point.percent, source: "api" },
      create: {
        indicatorId,
        periodYear: point.periodYear,
        periodMonth: point.periodMonth,
        value: point.percent,
        source: "api",
        notes: `Rodada NR-1: ${point.surveyTitle}`,
        recordedBy: userId,
      },
    });
  }
}

nr1Router.get("/:orgId/nr1/indicators", async (req, res) => {
  try {
    const orgId = req.params.orgId;
    const managedTeamIds = await getManagedTeamIds(req.userId!, orgId);
    if (managedTeamIds !== null && managedTeamIds.length === 0) {
      return res.json({ factors: [], series: [] });
    }
    const surveys = await prisma.nR1Survey.findMany({
      where: {
        organizationId: orgId,
        ...(managedTeamIds !== null ? { teamId: { in: managedTeamIds } } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { responses: true },
    });
    const inputs = surveys
      .filter((s) => s.responses.length >= NR1_MIN_RESPONSES)
      .map((s) => ({
        id: s.id,
        title: s.title,
        teamId: s.teamId,
        createdAt: s.createdAt,
        answers: s.responses.map((r) => r.answers as NR1Answers),
      }));
    res.json(nr1IndicatorSnapshot(inputs));
  } catch (err) {
    badReq(res, err);
  }
});

/** Sincroniza manualmente o resultado do NR-1 com os indicadores. */
nr1Router.post("/:orgId/nr1/indicators/sync", async (req, res) => {
  try {
    await syncNr1ToIndicators(req.params.orgId, req.userId!);
    res.json({ ok: true });
  } catch (err) {
    badReq(res, err);
  }
});

// Link permanente de denúncia anônima da organização (criado sob demanda).
nr1Router.get("/:orgId/nr1/complaint-channel", async (req, res) => {
  try {
    const orgId = req.params.orgId;
    let channel = await prisma.nR1ComplaintChannel.findUnique({ where: { organizationId: orgId } });
    if (!channel) {
      try {
        channel = await prisma.nR1ComplaintChannel.create({
          data: { organizationId: orgId, token: genToken() },
        });
      } catch (createErr) {
        // Duas requisições simultâneas: o primeiro create venceu.
        channel = await prisma.nR1ComplaintChannel.findUnique({
          where: { organizationId: orgId },
        });
        if (!channel) throw createErr;
      }
    }
    res.json(channel);
  } catch (err) {
    badReq(res, err);
  }
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

/**
 * Limitador de requisições em memória para as rotas públicas. Sem ele, um
 * único cliente pode enviar respostas em massa e, sozinho, atingir o
 * mínimo de 3 respostas — quebrando o anonimato do resultado agregado.
 */
const publicHits = new Map<string, { count: number; resetAt: number }>();
function publicRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSeconds: number } {
  const now = Date.now();
  const entry = publicHits.get(key);
  if (!entry || entry.resetAt <= now) {
    publicHits.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterSeconds: 0 };
  }
  entry.count += 1;
  if (entry.count > limit) {
    return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
  }
  return { allowed: true, retryAfterSeconds: 0 };
}
// Limpeza periódica do mapa para não crescer indefinidamente.
setInterval(
  () => {
    const now = Date.now();
    for (const [key, entry] of publicHits) if (entry.resetAt <= now) publicHits.delete(key);
  },
  10 * 60 * 1000,
).unref?.();

/** Identifica o cliente do fluxo público sem depender de proxy confiável. */
function clientKey(req: { ip?: string; socket?: { remoteAddress?: string } }) {
  return req.ip || req.socket?.remoteAddress || "unknown";
}

publicNr1Router.get("/nr1/survey/:token", async (req, res) => {
  try {
    const s = await prisma.nR1Survey.findUnique({ where: { token: req.params.token } });
    if (!s || s.status !== "open")
      return res.status(404).json({ error: "Pesquisa não encontrada ou encerrada." });
    res.json({ title: s.title, questions: QUESTIONS, factors: NR1_FACTORS });
  } catch (err) {
    badReq(res, err);
  }
});

// Escala 1–5 + N/A (Marco 3.4). N/A não entra no cálculo dos fatores.
const answerSchema = z.object({
  answers: z.record(z.string(), z.union([z.number().min(1).max(5), z.literal("na")])),
});

publicNr1Router.post("/nr1/survey/:token/answer", async (req, res) => {
  try {
    const rate = publicRateLimit(`answer:${req.params.token}:${clientKey(req)}`, 5, 60 * 60 * 1000);
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      return res
        .status(429)
        .json({ error: "Muitas respostas enviadas. Aguarde alguns minutos e tente novamente." });
    }
    const s = await prisma.nR1Survey.findUnique({ where: { token: req.params.token } });
    if (!s || s.status !== "open")
      return res.status(404).json({ error: "Pesquisa não encontrada ou encerrada." });

    const data = answerSchema.parse(req.body);
    const values = NR1_QUESTION_IDS.map((id) => data.answers[id]).filter(
      (v): v is number => typeof v === "number",
    );
    if (values.length === 0)
      return badReq(res, new Error("Responda ao menos uma pergunta válida."));
    // Resposta parcial não conta como respondente: sem completude, uma
    // pessoa sozinha poderia atingir o mínimo de 3 respostas e expor o
    // resultado agregado da equipe.
    const answered = NR1_QUESTION_IDS.filter((id) => data.answers[id] !== undefined).length;
    if (answered < NR1_QUESTION_IDS.length) {
      return badReq(
        res,
        new Error("Responda todas as perguntas antes de enviar (use N/A quando não se aplica)."),
      );
    }
    // A coluna `risk_score` guarda a média das respostas na escala 1–5, ou
    // seja, quanto *favorável* a condição percebida está — quanto maior,
    // melhor. O nome da coluna é histórico; o valor não é um índice de risco
    // e por isso nunca deve ser lido como "risco maior = pior".
    const averageScore = values.reduce((a, b) => a + b, 0) / values.length;

    await prisma.nR1Response.create({
      data: {
        surveyId: s.id,
        answers: data.answers as unknown as object,
        riskScore: averageScore,
        respondentIp: req.ip || req.socket.remoteAddress || null,
      },
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    badReq(res, err);
  }
});

publicNr1Router.get("/nr1/complaint/:token", async (req, res) => {
  try {
    const channel = await prisma.nR1ComplaintChannel.findUnique({
      where: { token: req.params.token },
    });
    if (!channel) return res.status(404).json({ error: "Canal não encontrado." });
    res.json({ ok: true });
  } catch (err) {
    badReq(res, err);
  }
});

const complaintSchema = z.object({
  message: z.string().min(5).max(4000),
  category: z.string().max(80).optional().nullable(),
});

publicNr1Router.post("/nr1/complaint/:token", async (req, res) => {
  try {
    const rate = publicRateLimit(
      `complaint:${req.params.token}:${clientKey(req)}`,
      5,
      60 * 60 * 1000,
    );
    if (!rate.allowed) {
      res.setHeader("Retry-After", String(rate.retryAfterSeconds));
      return res
        .status(429)
        .json({ error: "Muitas denúncias enviadas. Aguarde alguns minutos e tente novamente." });
    }
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
        respondentIp: req.ip || req.socket.remoteAddress || null,
      },
    });

    // Notificação não bloqueia a resposta, mas não pode ficar solta: sem
    // await, uma falha viraria unhandledRejection e ninguém saberia.
    await notifyAuthorizedLeaders(
      channel.organizationId,
      "Nova denúncia anônima (NR-1)",
      "Uma denúncia anônima foi registrada. Nenhuma informação do denunciante foi coletada.",
    ).catch((err) => console.error("[nr1] notificação de denúncia falhou", err));

    res.status(201).json({ ok: true });
  } catch (err) {
    badReq(res, err);
  }
});
