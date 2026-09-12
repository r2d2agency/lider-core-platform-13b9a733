import express from "express";
import helmet from "helmet";
import morgan from "morgan";
import fs from "node:fs";
import { env } from "./env.js";
import { authRouter } from "./routes/auth.routes.js";
import { orgsRouter } from "./routes/organizations.routes.js";
import { adminRouter } from "./routes/admin.routes.js";
import { franchiseRouter } from "./routes/franchise.routes.js";
import { companyRouter } from "./routes/company.routes.js";
import { platformRouter } from "./routes/platform.routes.js";
import { billingRouter } from "./routes/billing.routes.js";
import { webhooksRouter } from "./routes/webhooks.routes.js";
import { notificationsRouter } from "./routes/notifications.routes.js";
import { dataRouter } from "./routes/data.routes.js";
import { organizationRouter } from "./routes/organization.routes.js";
import { indicatorsRouter } from "./routes/indicators.routes.js";
import { conscienciaRouter } from "./routes/consciencia.routes.js";
import { evolutionRouter } from "./routes/evolution.routes.js";
import { feedbacksRouter } from "./routes/feedbacks.routes.js";
import { teamRouter } from "./routes/team.routes.js";
import { pdisRouter } from "./routes/pdis.routes.js";
import { aiRouter } from "./routes/ai.routes.js";
import { baseRouter } from "./routes/base.routes.js";
import { oneOnOnesRouter } from "./routes/one-on-ones.routes.js";
import { dashboardRouter } from "./routes/dashboard.routes.js";
import { threeSixtyRouter } from "./routes/three-sixty.routes.js";
import { pulsesRouter, publicPulsesRouter } from "./routes/pulses.routes.js";
import { cyclesRouter } from "./routes/cycles.routes.js";
import { nr1Router, publicNr1Router } from "./routes/nr1.routes.js";
import { kudosRouter } from "./routes/kudos.routes.js";
import { coachRouter } from "./routes/coach.routes.js";
import { calendarRouter, calendarPublicRouter } from "./routes/calendar.routes.js";
import {
  featureTemplatesRouter,
  bootstrapFeatureTemplates,
  resolveUserFeatures,
} from "./routes/feature-templates.routes.js";
import {
  signupPlansRouter,
  publicSignupPlansRouter,
  bootstrapSignupPlans,
} from "./routes/signup-plans.routes.js";
import { invitesRouter, publicInvitesRouter } from "./routes/invites.routes.js";
import { neoRouter } from "./routes/neo.routes.js";
import { jornadaRouter } from "./routes/jornada.routes.js";
import { publicAssessmentsRouter } from "./routes/assessments-public.routes.js";
import { bootstrapCoreAssessments } from "./lib/bootstrap-assessments.js";
import { meRouter } from "./routes/me.routes.js";
import { requireAuth } from "./auth.js";
import { prisma } from "./prisma.js";

const app = express();

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[process] uncaughtException", error);
});

// CORS — echo whatever Origin the browser sends. This guarantees the
// preflight always passes even when the deployment env var is misconfigured.
// If you need to lock this down later, filter req.headers.origin here.
const defaultAllowedHeaders = "Content-Type, Authorization, X-Requested-With, Accept, Origin";

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const requestedHeaders = req.headers["access-control-request-headers"];

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  } else {
    res.setHeader("Access-Control-Allow-Origin", "*");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    typeof requestedHeaders === "string" && requestedHeaders.length > 0
      ? requestedHeaders
      : defaultAllowedHeaders,
  );
  res.setHeader("Access-Control-Expose-Headers", "Content-Length, Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  next();
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    crossOriginOpenerPolicy: false,
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(morgan(env.NODE_ENV === "production" ? "combined" : "dev"));

// Serve uploaded files (logos, favicons, brand assets)
try {
  fs.mkdirSync(env.UPLOADS_DIR, { recursive: true });
} catch (err) {
  console.error("[uploads] cannot create dir", env.UPLOADS_DIR, err);
}
app.use(
  "/uploads",
  express.static(env.UPLOADS_DIR, {
    maxAge: "7d",
    setHeaders: (res) => {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    },
  }),
);

app.get("/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// PUBLIC endpoints (webhooks + cron) — mounted BEFORE auth. Each handler
// authenticates itself via the token/secret stored in PlatformSetting.
app.use("/api/public", webhooksRouter);
app.use("/api/public", publicPulsesRouter);
app.use("/api/public", publicNr1Router);
app.use("/api/public", calendarPublicRouter);
app.use("/api/public", publicAssessmentsRouter);
// Rota pública de listagem de planos de cadastro
app.use("/auth", publicSignupPlansRouter);
app.use("/auth", publicInvitesRouter);

app.use("/auth", authRouter);
app.use("/organizations", orgsRouter);
app.use("/admin", adminRouter);
app.use("/franchises", franchiseRouter);
app.use("/companies", companyRouter);
app.use("/platform", platformRouter);
app.use("/billing", billingRouter);
app.use("/notifications", notificationsRouter);
app.use("/data", dataRouter);
app.use("/organization", organizationRouter);
app.use("/organization", indicatorsRouter);
app.use("/organization", conscienciaRouter);
app.use("/organization", evolutionRouter);
app.use("/organization", feedbacksRouter);
app.use("/organization", dashboardRouter);
app.use("/organization", teamRouter);
app.use("/organization", pdisRouter);
app.use("/organization", aiRouter);
app.use("/organization", baseRouter);
app.use("/organization", oneOnOnesRouter);
app.use("/organization", threeSixtyRouter);
app.use("/organization", pulsesRouter);
app.use("/organization", cyclesRouter);
app.use("/organization", nr1Router);
app.use("/organization", jornadaRouter);
app.use("/organization", kudosRouter);
app.use("/organization", coachRouter);
app.use("/organization", calendarRouter);

// Templates modulares
app.use("/admin/feature-templates", featureTemplatesRouter);
app.use("/admin/signup-plans", signupPlansRouter);
app.use("/admin/invites", invitesRouter);
app.use("/admin/neo", neoRouter);

// Endpoints do "eu logado" (Home Briefing, DNA, jornada inicial)
app.use("/me", meRouter);

// Resolvedor de features para o usuário logado (consumido pela UI)
app.get("/auth/me/features", requireAuth, async (req, res) => {
  try {
    const data = await resolveUserFeatures(req.userId!);
    res.json(data);
  } catch (err) {
    console.error("[features] falha ao resolver", err);
    res.status(500).json({ error: "Falha ao carregar features" });
  }
});

app.use((_req, res) => res.status(404).json({ error: "Not found" }));

app.use(
  (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error(err);
    if (res.headersSent) return;
    res.status(500).json({ error: "Internal server error" });
  },
);

app.listen(env.PORT, () => {
  console.log(`[api] listening on :${env.PORT}`);
  void bootstrapSuperAdmins();
  void bootstrapDefaultPlans();
  void bootstrapDefaultCompetencies();
  void bootstrapDefaultModules();
  void bootstrapDefaultPermissions();
  void bootstrapFeatureTemplates();
  void bootstrapSignupPlans();
  void bootstrapCoreAssessments();
});

async function bootstrapSuperAdmins() {
  const emails = env.SUPER_ADMIN_EMAILS;
  if (!emails.length) return;
  try {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true, email: true },
    });
    for (const u of users) {
      await prisma.userRole.upsert({
        where: { userId_role: { userId: u.id, role: "super_admin" } },
        update: {},
        create: { userId: u.id, role: "super_admin" },
      });
      console.log(`[bootstrap] super_admin garantido para ${u.email}`);
    }
    const missing = emails.filter((e) => !users.find((u) => u.email.toLowerCase() === e));
    for (const e of missing) {
      console.log(
        `[bootstrap] usuário ${e} ainda não cadastrado — será promovido no próximo boot após registro`,
      );
    }
  } catch (err) {
    console.error("[bootstrap] falha ao promover super_admins", err);
  }
}

async function bootstrapDefaultPlans() {
  const defaults = [
    {
      slug: "essencial",
      name: "Essencial",
      description: "Para começar com líderes individuais.",
      priceMonthly: 9900,
      priceYearly: 99000,
      features: ["Dashboard do Líder", "Avaliação C.O.R.E.", "PDI"],
      limits: { max_leaders: 10, max_companies: 1, max_ai_tokens: 100000 },
    },
    {
      slug: "profissional",
      name: "Profissional",
      description: "Franquias e times médios com IA Coach.",
      priceMonthly: 29900,
      priceYearly: 299000,
      features: ["Tudo do Essencial", "IA Coach", "Dashboard Empresa", "Feedbacks automáticos"],
      limits: { max_leaders: 100, max_companies: 10, max_ai_tokens: 1000000 },
    },
    {
      slug: "enterprise",
      name: "Enterprise",
      description: "Consultorias e grandes redes com branding próprio.",
      priceMonthly: 0,
      priceYearly: 0,
      features: [
        "Tudo do Profissional",
        "Branding próprio",
        "Métodos customizados",
        "SLA dedicado",
      ],
      limits: { max_leaders: null, max_companies: null, max_ai_tokens: null },
    },
  ];
  try {
    for (const p of defaults) {
      await prisma.plan.upsert({
        where: { slug: p.slug },
        update: {},
        create: p,
      });
    }
    console.log(`[bootstrap] planos padrão garantidos (${defaults.length})`);
  } catch (err) {
    console.error("[bootstrap] falha ao criar planos padrão", err);
  }
}

async function bootstrapDefaultCompetencies() {
  const defaults = [
    { code: "lideranca", name: "Liderança", weight: 3, orderIndex: 1 },
    { code: "comunicacao", name: "Comunicação", weight: 2, orderIndex: 2 },
    { code: "visao_estrategica", name: "Visão Estratégica", weight: 3, orderIndex: 3 },
    { code: "gestao_pessoas", name: "Gestão de Pessoas", weight: 3, orderIndex: 4 },
    { code: "tomada_decisao", name: "Tomada de Decisão", weight: 2, orderIndex: 5 },
    { code: "inteligencia_emocional", name: "Inteligência Emocional", weight: 2, orderIndex: 6 },
  ];
  try {
    for (const c of defaults) {
      await prisma.methodologyCompetency.upsert({
        where: { code: c.code },
        update: {},
        create: c,
      });
    }
    console.log(`[bootstrap] competências C.O.R.E. garantidas (${defaults.length})`);
  } catch (err) {
    console.error("[bootstrap] falha ao criar competências", err);
  }
}

async function bootstrapDefaultModules() {
  const defaults = [
    { code: "consciencia", name: "Consciência", category: "core" as const, orderIndex: 1 },
    { code: "organizacao", name: "Organização", category: "core" as const, orderIndex: 2 },
    { code: "resultado", name: "Resultado", category: "core" as const, orderIndex: 3 },
    { code: "evolucao", name: "Evolução", category: "core" as const, orderIndex: 4 },
    { code: "ia_coach", name: "IA Coach", category: "ia" as const, orderIndex: 5 },
    {
      code: "dashboard_executivo",
      name: "Dashboard Executivo",
      category: "analytics" as const,
      orderIndex: 6,
    },
    { code: "analytics", name: "Analytics", category: "analytics" as const, orderIndex: 7 },
    { code: "benchmark", name: "Benchmark", category: "analytics" as const, orderIndex: 8 },
    { code: "feedback", name: "Feedback 360º", category: "people" as const, orderIndex: 9 },
    { code: "pdi", name: "PDI", category: "people" as const, orderIndex: 10 },
  ];
  try {
    for (const m of defaults) {
      await prisma.productModule.upsert({
        where: { code: m.code },
        update: {},
        create: m,
      });
    }
    console.log(`[bootstrap] módulos do produto garantidos (${defaults.length})`);
  } catch (err) {
    console.error("[bootstrap] falha ao criar módulos", err);
  }
}

async function bootstrapDefaultPermissions() {
  // Matriz padrão sensata; admins podem customizar depois.
  const grants: Array<{
    role: "super_admin" | "neo_admin" | "franchise_owner" | "hr_admin" | "leader" | "collaborator";
    resource: string;
    action: "view" | "edit" | "delete" | "export" | "admin";
  }> = [];
  const RESOURCES = [
    "organizations",
    "franchises",
    "users",
    "branches",
    "areas",
    "teams",
    "plans",
    "licenses",
    "subscriptions",
    "invoices",
    "ai_settings",
    "branding",
    "methodology",
    "modules",
    "onboarding",
    "audit_log",
    "settings",
    "reports",
  ];
  // super_admin: tudo
  for (const r of RESOURCES)
    for (const a of ["view", "edit", "delete", "export", "admin"] as const)
      grants.push({ role: "super_admin", resource: r, action: a });
  // neo_admin: tudo exceto delete em plans/licenses/subscriptions
  for (const r of RESOURCES)
    for (const a of ["view", "edit", "export"] as const)
      grants.push({ role: "neo_admin", resource: r, action: a });
  // franchise_owner: view/edit em orgs, users, branches, areas, teams, licenses, onboarding, reports
  for (const r of [
    "organizations",
    "users",
    "branches",
    "areas",
    "teams",
    "licenses",
    "onboarding",
    "reports",
    "branding",
  ])
    for (const a of ["view", "edit", "export"] as const)
      grants.push({ role: "franchise_owner", resource: r, action: a });
  // hr_admin: users/areas/teams/onboarding/reports
  for (const r of ["users", "branches", "areas", "teams", "onboarding", "reports"])
    for (const a of ["view", "edit"] as const)
      grants.push({ role: "hr_admin", resource: r, action: a });
  // leader: view teams/reports/users
  for (const r of ["users", "areas", "teams", "reports"])
    grants.push({ role: "leader", resource: r, action: "view" });
  // collaborator: view próprio time/reports básicos
  for (const r of ["teams", "reports"])
    grants.push({ role: "collaborator", resource: r, action: "view" });
  try {
    for (const g of grants) {
      await prisma.rolePermission.upsert({
        where: { role_resource_action: g },
        update: {},
        create: g,
      });
    }
    console.log(`[bootstrap] permissões padrão garantidas (${grants.length})`);
  } catch (err) {
    console.error("[bootstrap] falha ao criar permissões", err);
  }
}
