import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { prisma } from "../prisma.js";
import { requireAuth, requireRoles } from "../auth.js";
import { env } from "../env.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRoles("super_admin", "neo_admin"));

// ============================================================
// File uploads (branding assets: logos, favicons, etc.)
// ============================================================
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
  "image/gif",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

const uploadStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    try {
      fs.mkdirSync(env.UPLOADS_DIR, { recursive: true });
      cb(null, env.UPLOADS_DIR);
    } catch (err) {
      cb(err as Error, env.UPLOADS_DIR);
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 8) || ".bin";
    const safeExt = /^\.[a-z0-9]+$/.test(ext) ? ext : ".bin";
    const id = crypto.randomBytes(12).toString("hex");
    cb(null, `${Date.now()}-${id}${safeExt}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error("Formato não suportado. Use PNG, JPG, WEBP, SVG, GIF ou ICO."));
    }
    cb(null, true);
  },
});

adminRouter.post("/uploads", (req, res) => {
  upload.single("file")(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message ?? "Upload falhou" });
    if (!req.file) return res.status(400).json({ error: "Arquivo ausente" });
    const base = (env.PUBLIC_API_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const url = `${base}/uploads/${req.file.filename}`;
    res.status(201).json({
      url,
      path: `/uploads/${req.file.filename}`,
      filename: req.file.filename,
      size: req.file.size,
      mimeType: req.file.mimetype,
    });
  });
});

// ============================================================
// Stats
// ============================================================
adminRouter.get("/stats", async (_req, res) => {
  const [organizations, users, superAdmins, franchises, activeSubs] = await Promise.all([
    prisma.organization.count(),
    prisma.user.count(),
    prisma.userRole.count({ where: { role: "super_admin" } }),
    prisma.franchise.count(),
    prisma.subscription.count({ where: { status: "active" } }),
  ]);
  res.json({ organizations, users, superAdmins, franchises, activeSubs });
});

// ============================================================
// Users
// ============================================================
adminRouter.get("/users", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const users = await prisma.user.findMany({
    where: q ? { email: { contains: q, mode: "insensitive" } } : undefined,
    include: { profile: true, roles: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  res.json(
    users.map((u) => ({
      id: u.id,
      email: u.email,
      fullName: u.profile?.fullName ?? null,
      createdAt: u.createdAt,
      roles: u.roles.map((r) => r.role),
    })),
  );
});

const promoteSchema = z.object({
  role: z.enum([
    "super_admin",
    "neo_admin",
    "franchise_owner",
    "hr_admin",
    "leader",
    "collaborator",
  ]),
});

adminRouter.post("/users/:id/roles", async (req, res) => {
  const parsed = promoteSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const role = await prisma.userRole.upsert({
    where: { userId_role: { userId: req.params.id, role: parsed.data.role } },
    update: {},
    create: { userId: req.params.id, role: parsed.data.role },
  });
  res.json(role);
});

adminRouter.delete("/users/:id/roles/:role", async (req, res) => {
  await prisma.userRole
    .delete({
      where: {
        userId_role: {
          userId: req.params.id,
          role: req.params.role as never,
        },
      },
    })
    .catch(() => null);
  res.status(204).end();
});

const createUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
});

adminRouter.post("/users", async (req, res) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { email, password, fullName } = parsed.data;
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email já cadastrado" });
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await bcrypt.hash(password, 10),
      profile: { create: { fullName } },
    },
  });
  res.status(201).json({ id: user.id, email: user.email });
});

// ============================================================
// Franchises
// ============================================================
adminRouter.get("/franchises", async (_req, res) => {
  const franchises = await prisma.franchise.findMany({
    include: {
      owner: { include: { profile: true } },
      plan: true,
      _count: { select: { organizations: true, members: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(franchises);
});

const franchiseCreateSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  cnpj: z.string().optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
  planId: z.string().uuid().optional().nullable(),
});

adminRouter.post("/franchises", async (req, res) => {
  const parsed = franchiseCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const franchise = await prisma.franchise.create({ data: parsed.data });
  if (parsed.data.ownerUserId) {
    await prisma.franchiseMember.upsert({
      where: {
        franchiseId_userId: { franchiseId: franchise.id, userId: parsed.data.ownerUserId },
      },
      update: { role: "owner" },
      create: { franchiseId: franchise.id, userId: parsed.data.ownerUserId, role: "owner" },
    });
  }
  res.status(201).json(franchise);
});

adminRouter.get("/franchises/:id", async (req, res) => {
  const f = await prisma.franchise.findUnique({
    where: { id: req.params.id },
    include: {
      owner: { include: { profile: true } },
      plan: true,
      organizations: true,
      members: { include: { user: { include: { profile: true } } } },
    },
  });
  if (!f) return res.status(404).json({ error: "Franquia não encontrada" });
  res.json(f);
});

const franchiseUpdateSchema = franchiseCreateSchema.partial().extend({
  status: z.enum(["trial", "active", "suspended", "canceled"]).optional(),
});

adminRouter.patch("/franchises/:id", async (req, res) => {
  const parsed = franchiseUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const f = await prisma.franchise.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(f);
});

adminRouter.delete("/franchises/:id", async (req, res) => {
  await prisma.franchise.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});

const franchiseMemberSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["owner", "admin", "consultant"]).default("consultant"),
});

adminRouter.post("/franchises/:id/members", async (req, res) => {
  const parsed = franchiseMemberSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const m = await prisma.franchiseMember.upsert({
    where: { franchiseId_userId: { franchiseId: req.params.id, userId: parsed.data.userId } },
    update: { role: parsed.data.role },
    create: {
      franchiseId: req.params.id,
      userId: parsed.data.userId,
      role: parsed.data.role,
    },
  });
  res.status(201).json(m);
});

adminRouter.delete("/franchises/:id/members/:userId", async (req, res) => {
  await prisma.franchiseMember
    .delete({
      where: {
        franchiseId_userId: {
          franchiseId: req.params.id,
          userId: req.params.userId,
        },
      },
    })
    .catch(() => null);
  res.status(204).end();
});

// ============================================================
// Organizations (admin view — all of them)
// ============================================================
adminRouter.get("/organizations", async (req, res) => {
  const q = (req.query.q as string | undefined)?.trim();
  const franchiseId = req.query.franchiseId as string | undefined;
  const orgs = await prisma.organization.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { name: { contains: q, mode: "insensitive" } },
                { slug: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
        franchiseId ? { franchiseId } : {},
      ],
    },
    include: {
      franchise: true,
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  res.json(orgs);
});

const orgCreateSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  cnpj: z.string().optional().nullable(),
  franchiseId: z.string().uuid().optional().nullable(),
  plan: z.enum(["essencial", "profissional", "enterprise"]).optional(),
  legalName: z.string().optional().nullable(),
  tradeName: z.string().optional().nullable(),
  stateRegistration: z.string().optional().nullable(),
  segment: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  whatsapp: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  website: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  primaryColor: z.string().optional().nullable(),
  employeeCount: z.number().int().min(0).optional().nullable(),
  leaderCount: z.number().int().min(0).optional().nullable(),
  licenseCount: z.number().int().min(0).optional().nullable(),
  notes: z.string().optional().nullable(),
});

adminRouter.post("/organizations", async (req, res) => {
  const parsed = orgCreateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const org = await prisma.organization.create({ data: parsed.data });
  res.status(201).json(org);
});

adminRouter.patch("/organizations/:id", async (req, res) => {
  const parsed = orgCreateSchema
    .partial()
    .extend({
      status: z.enum(["trial", "active", "suspended", "canceled"]).optional(),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const org = await prisma.organization.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(org);
});

adminRouter.delete("/organizations/:id", async (req, res) => {
  await prisma.organization.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});

// ============================================================
// Plans
// ============================================================
adminRouter.get("/plans", async (_req, res) => {
  const plans = await prisma.plan.findMany({ orderBy: { priceMonthly: "asc" } });
  res.json(plans);
});

const planSchema = z.object({
  name: z.string().min(1),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/),
  description: z.string().optional().nullable(),
  priceMonthly: z.number().int().min(0).default(0),
  priceYearly: z.number().int().min(0).default(0),
  currency: z.string().length(3).default("BRL"),
  limits: z.record(z.any()).optional().nullable(),
  features: z.array(z.string()).default([]),
  active: z.boolean().default(true),
  target: z.enum(["organization", "individual"]).default("organization"),
});

type PlanInput = z.infer<typeof planSchema>;

const normalizePlanData = (data: Partial<PlanInput>): never => {
  const { limits, ...rest } = data;
  return (limits == null ? rest : { ...rest, limits }) as never;
};

adminRouter.post("/plans", async (req, res) => {
  const parsed = planSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const p = await prisma.plan.create({ data: normalizePlanData(parsed.data) });
  res.status(201).json(p);
});

adminRouter.patch("/plans/:id", async (req, res) => {
  const parsed = planSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const p = await prisma.plan.update({
    where: { id: req.params.id },
    data: normalizePlanData(parsed.data),
  });
  res.json(p);
});

adminRouter.delete("/plans/:id", async (req, res) => {
  await prisma.plan.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});

// ============================================================
// Subscriptions
// ============================================================
adminRouter.get("/subscriptions", async (_req, res) => {
  const subs = await prisma.subscription.findMany({
    include: { plan: true, invoices: { orderBy: { createdAt: "desc" }, take: 5 } },
    orderBy: { createdAt: "desc" },
  });
  res.json(subs);
});

const subSchema = z.object({
  ownerType: z.enum(["franchise", "organization", "individual"]),
  ownerId: z.string().uuid(),
  planId: z.string().uuid(),
  status: z.enum(["trial", "active", "past_due", "canceled"]).default("trial"),
  currentPeriodStart: z.string().datetime().optional().nullable(),
  currentPeriodEnd: z.string().datetime().optional().nullable(),
  provider: z.string().optional().nullable(),
});

adminRouter.post("/subscriptions", async (req, res) => {
  const parsed = subSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const s = await prisma.subscription.create({
    data: {
      ...parsed.data,
      currentPeriodStart: parsed.data.currentPeriodStart
        ? new Date(parsed.data.currentPeriodStart)
        : null,
      currentPeriodEnd: parsed.data.currentPeriodEnd
        ? new Date(parsed.data.currentPeriodEnd)
        : null,
    },
  });
  res.status(201).json(s);
});

adminRouter.patch("/subscriptions/:id", async (req, res) => {
  const parsed = subSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const s = await prisma.subscription.update({
    where: { id: req.params.id },
    data: {
      ...parsed.data,
      currentPeriodStart: parsed.data.currentPeriodStart
        ? new Date(parsed.data.currentPeriodStart)
        : undefined,
      currentPeriodEnd: parsed.data.currentPeriodEnd
        ? new Date(parsed.data.currentPeriodEnd)
        : undefined,
    },
  });
  res.json(s);
});

// ============================================================
// AI Settings
// ============================================================
const aiSchema = z.object({
  scope: z.enum(["global", "franchise", "organization"]),
  scopeId: z.string().uuid().optional().nullable(),
  provider: z.enum(["openai", "gemini"]),
  model: z.string().min(1),
  apiKeySecretRef: z.string().optional().nullable(),
  apiKey: z.string().optional().nullable(),
  monthlyTokenLimit: z.number().int().min(0).optional().nullable(),
  temperature: z.number().min(0).max(2).default(0.7),
});

adminRouter.post("/ai-settings", async (req, res) => {
  try {
    const parsed = aiSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

    // Se o cliente mandou apiKey vazia, não sobrescrever a chave já salva.
    const { apiKey, ...rest } = parsed.data;
    const scopeId = rest.scope === "global" ? null : rest.scopeId;
    const cleanKey = apiKey && apiKey.trim() ? apiKey.trim() : null;
    const existing = await prisma.aISettings.findFirst({
      where: { scope: rest.scope, scopeId },
      orderBy: { updatedAt: "desc" },
    });

    const s = existing
      ? await prisma.aISettings.update({
          where: { id: existing.id },
          data: cleanKey ? { ...rest, scopeId, apiKey: cleanKey } : { ...rest, scopeId },
        })
      : await prisma.aISettings.create({
          data: { ...rest, scopeId, apiKey: cleanKey },
        });

    // Nunca devolver a chave em claro
    res.status(201).json({ ...s, apiKey: s.apiKey ? "••••••••" : null });
  } catch (err) {
    console.error("[ai-settings] save failed", err);
    res.status(500).json({ error: "Não foi possível salvar a configuração de IA." });
  }
});

// GET mascarado — usado pela tela de admin
adminRouter.get("/ai-settings", async (_req, res) => {
  try {
    const list = await prisma.aISettings.findMany({ orderBy: { createdAt: "desc" } });
    res.json(list.map((s) => ({ ...s, apiKey: s.apiKey ? "••••••••" : null })));
  } catch (err) {
    console.error("[ai-settings] list failed", err);
    res.status(500).json({ error: "Não foi possível carregar a configuração de IA." });
  }
});

// POST /admin/ai-settings/test — envia um prompt curto e devolve a resposta
adminRouter.post("/ai-settings/test", async (_req, res) => {
  try {
    const { completeChat } = await import("../lib/ai-gateway.js");
    const started = Date.now();
    const text = await completeChat({
      messages: [
        { role: "system", content: "Responda em uma frase curta em pt-BR." },
        { role: "user", content: "Diga 'IA conectada com sucesso.' e nada mais." },
      ],
    });
    res.json({ ok: true, latencyMs: Date.now() - started, sample: text.slice(0, 300) });
  } catch (err) {
    console.error("[ai-settings] test failed", err);
    res.status(200).json({
      ok: false,
      error: err instanceof Error ? err.message : "Falha ao testar provedor de IA",
    });
  }
});

// ============================================================
// Branding
// ============================================================
adminRouter.get("/branding", async (_req, res) => {
  const list = await prisma.branding.findMany();
  res.json(list);
});

const brandingSchema = z.object({
  scope: z.enum(["global", "franchise", "organization"]),
  scopeId: z.string().uuid().optional().nullable(),
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().optional().nullable(),
  accentColor: z.string().optional().nullable(),
  faviconUrl: z.string().url().optional().nullable(),
  emailFromName: z.string().optional().nullable(),
});

adminRouter.post("/branding", async (req, res) => {
  const parsed = brandingSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const b = await prisma.branding.upsert({
    where: {
      scope_scopeId: { scope: parsed.data.scope, scopeId: parsed.data.scopeId ?? "" },
    } as never,
    update: parsed.data,
    create: parsed.data,
  });
  res.status(201).json(b);
});

// ============================================================
// Methodology
// ============================================================
adminRouter.get("/methodology", async (_req, res) => {
  const comps = await prisma.methodologyCompetency.findMany({ orderBy: { orderIndex: "asc" } });
  res.json(comps);
});

const compSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  weight: z.number().int().min(1).default(1),
  orderIndex: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  purpose: z.string().optional().nullable(),
  behaviors: z.array(z.string()).optional().default([]),
  practices: z.array(z.string()).optional().default([]),
  guidingQuestions: z.array(z.string()).optional().default([]),
  rituals: z.array(z.string()).optional().default([]),
  indicators: z.array(z.string()).optional().default([]),
  aiPrompt: z.string().optional().nullable(),
  color: z.string().optional().nullable(),
});

adminRouter.post("/methodology", async (req, res) => {
  const parsed = compSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const c = await prisma.methodologyCompetency.create({ data: parsed.data });
  res.status(201).json(c);
});

adminRouter.patch("/methodology/:id", async (req, res) => {
  const parsed = compSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const c = await prisma.methodologyCompetency.update({
    where: { id: req.params.id },
    data: parsed.data,
  });
  res.json(c);
});

adminRouter.delete("/methodology/:id", async (req, res) => {
  await prisma.methodologyCompetency.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});

// -------- Methodology Doc (manifesto, mission, principles, AI prompt) --------
const docSchema = z.object({
  mission: z.string().optional().nullable(),
  vision: z.string().optional().nullable(),
  manifesto: z.string().optional().nullable(),
  principles: z.array(z.string()).optional().default([]),
  leaderProfile: z.string().optional().nullable(),
  aiSystemPrompt: z.string().optional().nullable(),
  pillars: z.any().optional().nullable(),
});

adminRouter.get("/methodology-doc", async (_req, res) => {
  const doc = await prisma.methodologyDoc.findUnique({ where: { id: "singleton" } });
  res.json(
    doc ?? {
      id: "singleton",
      mission: null,
      vision: null,
      manifesto: null,
      principles: [],
      leaderProfile: null,
      aiSystemPrompt: null,
      pillars: null,
    },
  );
});

adminRouter.put("/methodology-doc", async (req, res) => {
  const parsed = docSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const doc = await prisma.methodologyDoc.upsert({
    where: { id: "singleton" },
    update: parsed.data as never,
    create: { id: "singleton", ...(parsed.data as Record<string, unknown>) } as never,
  });
  res.json(doc);
});

// ============================================================
// App releases
// ============================================================
adminRouter.get("/apps", async (_req, res) => {
  const releases = await prisma.appRelease.findMany({ orderBy: { publishedAt: "desc" } });
  res.json(releases);
});

const releaseSchema = z.object({
  platform: z.enum(["web", "desktop", "mobile"]),
  version: z.string().min(1),
  channel: z.enum(["stable", "beta"]).default("stable"),
  releaseNotes: z.string().optional().nullable(),
  downloadUrl: z.string().url().optional().nullable(),
});

adminRouter.post("/apps", async (req, res) => {
  const parsed = releaseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const r = await prisma.appRelease.create({ data: parsed.data });
  res.status(201).json(r);
});

// ============================================================
// Changelog operacional — o que foi corrigido, implementado ou modificado
// (item 8 do PDF de reorganização; distinto do release de apps acima)
// ============================================================
adminRouter.get("/changelog", async (_req, res) => {
  const entries = await prisma.changelogEntry.findMany({
    orderBy: { publishedAt: "desc" },
    take: 200,
  });
  res.json(entries);
});

const changelogSchema = z.object({
  type: z.enum(["fix", "feature", "change"]),
  title: z.string().min(2),
  description: z.string().optional().nullable(),
});

adminRouter.post("/changelog", async (req, res) => {
  const parsed = changelogSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const entry = await prisma.changelogEntry.create({
    data: { ...parsed.data, createdBy: req.userId! },
  });
  res.status(201).json(entry);
});

adminRouter.delete("/changelog/:id", async (req, res) => {
  await prisma.changelogEntry.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});

// ============================================================
// Documentação técnica, processos e roadmap (markdown por slug fixo)
// ============================================================
adminRouter.get("/docs/:slug", async (req, res) => {
  const doc = await prisma.platformDocument.findUnique({ where: { slug: req.params.slug } });
  res.json(doc ?? { slug: req.params.slug, title: "", contentMarkdown: "" });
});

const platformDocSchema = z.object({
  title: z.string().min(1),
  contentMarkdown: z.string().optional().nullable(),
});

adminRouter.put("/docs/:slug", async (req, res) => {
  const parsed = platformDocSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const saved = await prisma.platformDocument.upsert({
    where: { slug: req.params.slug },
    update: {
      title: parsed.data.title,
      contentMarkdown: parsed.data.contentMarkdown ?? null,
      updatedBy: req.userId!,
    },
    create: {
      slug: req.params.slug,
      title: parsed.data.title,
      contentMarkdown: parsed.data.contentMarkdown ?? null,
      updatedBy: req.userId!,
    },
  });
  res.json(saved);
});

// ============================================================
// Capacidade da plataforma — usuários únicos vs. capacidade atual
// ============================================================
adminRouter.get("/capacity", async (_req, res) => {
  const [uniqueUsers, organizations, activeOrganizations] = await Promise.all([
    prisma.user.count(),
    prisma.organization.count(),
    prisma.organization.count({ where: { status: "active" } }),
  ]);
  res.json({ uniqueUsers, organizations, activeOrganizations, capacityLimit: 100 });
});

// ============================================================
// Audit log (read-only)
// ============================================================
adminRouter.get("/audit-log", async (_req, res) => {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { actor: { include: { profile: true } } },
  });
  res.json(logs);
});
