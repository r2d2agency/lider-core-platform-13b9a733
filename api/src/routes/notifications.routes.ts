import { Router } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth, requireRoles } from "../auth.js";
import {
  loadNotificationsConfig,
  uazapiPing,
  metaPing,
  sendNotification,
} from "../lib/notifications.js";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

// ============================================================
// INBOX pessoal — qualquer usuário autenticado consulta suas
// próprias notificações in_app. Não requer papel administrativo.
// ============================================================

notificationsRouter.get("/inbox", async (req, res) => {
  const take = Math.min(Number(req.query.take) || 30, 100);
  const onlyUnread = req.query.unread === "1" || req.query.unread === "true";
  const list = await prisma.notificationLog.findMany({
    where: {
      userId: req.userId!,
      channel: "in_app",
      ...(onlyUnread ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take,
    select: {
      id: true,
      title: true,
      body: true,
      linkUrl: true,
      readAt: true,
      createdAt: true,
      organizationId: true,
    },
  });
  res.json(list);
});

notificationsRouter.get("/inbox/unread-count", async (req, res) => {
  const count = await prisma.notificationLog.count({
    where: { userId: req.userId!, channel: "in_app", readAt: null },
  });
  res.json({ count });
});

notificationsRouter.post("/inbox/:id/read", async (req, res) => {
  const updated = await prisma.notificationLog
    .updateMany({
      where: { id: req.params.id, userId: req.userId!, channel: "in_app", readAt: null },
      data: { readAt: new Date(), status: "read" },
    })
    .catch(() => ({ count: 0 }));
  res.json({ ok: true, updated: updated.count });
});

notificationsRouter.post("/inbox/read-all", async (req, res) => {
  const updated = await prisma.notificationLog.updateMany({
    where: { userId: req.userId!, channel: "in_app", readAt: null },
    data: { readAt: new Date(), status: "read" },
  });
  res.json({ ok: true, updated: updated.count });
});

notificationsRouter.delete("/inbox/:id", async (req, res) => {
  await prisma.notificationLog
    .deleteMany({ where: { id: req.params.id, userId: req.userId!, channel: "in_app" } })
    .catch(() => null);
  res.status(204).end();
});

// Seed manual (útil para testar o sino sem esperar evento real)
const seedSchema = z.object({
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(500),
  linkUrl: z.string().optional().nullable(),
});
notificationsRouter.post("/inbox/seed", async (req, res) => {
  const parsed = seedSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const created = await prisma.notificationLog.create({
    data: {
      channel: "in_app",
      direction: "outbound",
      status: "delivered",
      to: req.userId!,
      userId: req.userId!,
      title: parsed.data.title,
      body: parsed.data.body,
      linkUrl: parsed.data.linkUrl ?? null,
    },
  });
  res.status(201).json(created);
});

// ----- Config status -----
notificationsRouter.get(
  "/config",
  requireRoles("super_admin", "neo_admin"),
  async (_req, res) => {
    const cfg = await loadNotificationsConfig();
    res.json({
      whatsappProvider: cfg.whatsappProvider,
      uazapi: {
        configured: !!cfg.uazapiToken,
        baseUrl: cfg.uazapiBaseUrl,
        hasWebhookToken: !!cfg.uazapiWebhookToken,
      },
      meta: {
        configured: !!(cfg.metaAccessToken && cfg.metaPhoneNumberId),
        apiVersion: cfg.metaApiVersion,
        hasWebhookVerifyToken: !!cfg.metaWebhookVerifyToken,
        hasAppSecret: !!cfg.metaAppSecret,
      },
      defaultCountryCode: cfg.defaultCountryCode,
      defaultSenderName: cfg.defaultSenderName,
    });
  },
);

notificationsRouter.get(
  "/config/ping/uazapi",
  requireRoles("super_admin", "neo_admin"),
  async (_req, res) => {
    try {
      const r = await uazapiPing();
      res.json({ ok: r.ok, status: r.status, raw: r.raw });
    } catch (err) {
      const e = err as Error & { status?: number; body?: unknown };
      res.status(e.status ?? 500).json({ ok: false, error: e.message, body: e.body });
    }
  },
);

notificationsRouter.get(
  "/config/ping/meta",
  requireRoles("super_admin", "neo_admin"),
  async (_req, res) => {
    try {
      const r = await metaPing();
      res.json({ ok: r.ok, raw: r.raw });
    } catch (err) {
      const e = err as Error & { status?: number; body?: unknown };
      res.status(e.status ?? 500).json({ ok: false, error: e.message, body: e.body });
    }
  },
);

// ----- Test send -----
const testSchema = z.object({
  channel: z.enum(["whatsapp", "email", "sms", "in_app"]),
  to: z.string().min(3),
  text: z.string().min(1),
  subject: z.string().optional(),
  forceProvider: z.enum(["uazapi", "meta"]).optional(),
  templateCode: z.string().optional(),
  variables: z.array(z.string()).optional(),
});

notificationsRouter.post(
  "/test",
  requireRoles("super_admin", "neo_admin"),
  async (req, res) => {
    const parsed = testSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    try {
      const r = await sendNotification(parsed.data);
      res.json(r);
    } catch (err) {
      res.status(500).json({ ok: false, error: (err as Error).message });
    }
  },
);

// ----- Logs -----
notificationsRouter.get(
  "/logs",
  requireRoles("super_admin", "neo_admin"),
  async (req, res) => {
    const take = Math.min(Number(req.query.take) || 50, 200);
    const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const list = await prisma.notificationLog.findMany({
      where: {
        ...(channel ? { channel: channel as never } : {}),
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    res.json(list);
  },
);

// ----- Templates -----
const templateSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  channel: z.enum(["whatsapp_uazapi", "whatsapp_meta", "email", "sms", "in_app"]),
  subject: z.string().optional().nullable(),
  body: z.string().min(1),
  metaTemplateName: z.string().optional().nullable(),
  metaLanguage: z.string().optional().nullable(),
  variables: z.array(z.string()).optional(),
  active: z.boolean().optional().default(true),
});

notificationsRouter.get(
  "/templates",
  requireRoles("super_admin", "neo_admin"),
  async (_req, res) => {
    const list = await prisma.notificationTemplate.findMany({ orderBy: { name: "asc" } });
    res.json(list);
  },
);

notificationsRouter.post(
  "/templates",
  requireRoles("super_admin", "neo_admin"),
  async (req, res) => {
    const parsed = templateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
    const { code, variables, ...data } = parsed.data;
    const tpl = await prisma.notificationTemplate.upsert({
      where: { code },
      update: { ...data, variables: variables as never },
      create: { code, ...data, variables: variables as never },
    });
    res.json(tpl);
  },
);

notificationsRouter.delete(
  "/templates/:id",
  requireRoles("super_admin", "neo_admin"),
  async (req, res) => {
    await prisma.notificationTemplate.delete({ where: { id: req.params.id } }).catch(() => null);
    res.status(204).end();
  },
);

// ----- Seed: templates das Metas da Corporação (§5.3 item 4 da spec) -----
// Templates in_app documentam as 5 mensagens da funcionalidade para
// treinamento (botão seed na tela Admin → Notificações). Idempotente.
const CORP_GOALS_SEED = [
  {
    code: "goals_corp_briefing_published",
    name: "Metas da Corporação — briefing publicado",
    channel: "in_app",
    subject: null,
    body: "Novas metas da empresa para o ciclo {{ciclo}}: {{total_metas}} metas aguardando sua leitura.",
    variables: ["ciclo", "total_metas"],
  },
  {
    code: "goals_corp_analysis_submitted",
    name: "Metas da Corporação — análise enviada",
    channel: "in_app",
    subject: null,
    body: "Análise de metas de {{lider}} enviada para revisão — ciclo {{ciclo}}.",
    variables: ["lider", "ciclo"],
  },
  {
    code: "goals_corp_analysis_returned",
    name: "Metas da Corporação — análise devolvida",
    channel: "in_app",
    subject: null,
    body: "Sua análise de metas para o ciclo {{ciclo}} foi devolvida. Comentário: {{comentario}}",
    variables: ["ciclo", "comentario"],
  },
  {
    code: "goals_corp_analysis_approved",
    name: "Metas da Corporação — análise aprovada",
    channel: "in_app",
    subject: null,
    body: "Análise de metas aprovada para o ciclo {{ciclo}}.",
    variables: ["ciclo"],
  },
  {
    code: "goals_corp_briefing_ratified",
    name: "Metas da Corporação — metas oficializadas",
    channel: "in_app",
    subject: null,
    body: "Metas da Corporação oficializadas para o ciclo {{ciclo}}. Veja-as no painel Resultados.",
    variables: ["ciclo"],
  },
] as const;

notificationsRouter.post(
  "/templates/seed-corporate-goals",
  requireRoles("super_admin", "neo_admin"),
  async (_req, res) => {
    const created: string[] = [];
    for (const t of CORP_GOALS_SEED) {
      const tpl = await prisma.notificationTemplate.upsert({
        where: { code: t.code },
        update: { name: t.name, channel: t.channel, body: t.body, variables: [...t.variables] as never },
        create: {
          code: t.code,
          name: t.name,
          channel: t.channel,
          subject: t.subject,
          body: t.body,
          variables: [...t.variables] as never,
        },
      });
      created.push(tpl.code);
    }
    res.json({ ok: true, created });
  },
);