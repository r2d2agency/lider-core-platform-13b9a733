import { Router, type Response } from "express";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { requireAuth } from "../auth.js";
import { FEATURE_CATALOG, TEMPLATE_DEFAULTS, type FeatureAction } from "../lib/feature-catalog.js";

export const featureTemplatesRouter = Router();
featureTemplatesRouter.use(requireAuth);

const ROLES = [
  "super_admin",
  "neo_admin",
  "franchise_owner",
  "hr_admin",
  "leader",
  "collaborator",
] as const;
type Role = (typeof ROLES)[number];

async function isSuperAdmin(userId: string) {
  const r = await prisma.userRole.findFirst({ where: { userId, role: "super_admin" } });
  return !!r;
}

function badReq(res: Response, err: unknown) {
  return res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
}

// -----------------------------------------------------------
// GET /admin/feature-templates/catalog — devolve o catálogo estático
// -----------------------------------------------------------
featureTemplatesRouter.get("/catalog", async (_req, res) => {
  res.json({ modules: FEATURE_CATALOG });
});

// -----------------------------------------------------------
// GET /admin/feature-templates — lista todos os templates por role
// -----------------------------------------------------------
featureTemplatesRouter.get("/", async (req, res) => {
  if (!(await isSuperAdmin(req.userId!))) return res.status(403).json({ error: "Forbidden" });
  const templates = await prisma.featureTemplate.findMany({
    include: { items: true },
    orderBy: { role: "asc" },
  });
  res.json({ templates });
});

// -----------------------------------------------------------
// PUT /admin/feature-templates/:role — upsert template + itens
// body: { name?, description?, items: [{featureKey, action, enabled}] }
// -----------------------------------------------------------
const itemsSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        featureKey: z.string().min(1),
        action: z.enum(["view", "edit", "delete", "export", "admin"]),
        enabled: z.boolean(),
      }),
    )
    .default([]),
});

featureTemplatesRouter.put("/:role", async (req, res) => {
  try {
    if (!(await isSuperAdmin(req.userId!))) return res.status(403).json({ error: "Forbidden" });
    const role = req.params.role as Role;
    if (!ROLES.includes(role)) return res.status(400).json({ error: "Role inválido" });

    const data = itemsSchema.parse(req.body);

    const template = await prisma.featureTemplate.upsert({
      where: { role },
      update: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description ?? null } : {}),
      },
      create: {
        role,
        name: data.name ?? TEMPLATE_DEFAULTS[role]?.name ?? role,
        description: data.description ?? TEMPLATE_DEFAULTS[role]?.description ?? null,
      },
    });

    // Substitui os itens em bloco (idempotente)
    await prisma.$transaction([
      prisma.featureTemplateItem.deleteMany({ where: { templateId: template.id } }),
      prisma.featureTemplateItem.createMany({
        data: data.items.map((i) => ({
          templateId: template.id,
          featureKey: i.featureKey,
          action: i.action,
          enabled: i.enabled,
        })),
        skipDuplicates: true,
      }),
    ]);

    const fresh = await prisma.featureTemplate.findUnique({
      where: { id: template.id },
      include: { items: true },
    });
    res.json(fresh);
  } catch (err) {
    badReq(res, err);
  }
});

// -----------------------------------------------------------
// GET /auth/me/features — resolve features do usuário atual
// Junta os templates de todos os roles do usuário (OR de enabled)
// -----------------------------------------------------------
export async function resolveUserFeatures(userId: string) {
  const roles = await prisma.userRole.findMany({
    where: { userId },
    select: { role: true },
  });
  const roleList: Role[] = roles.length > 0 ? (roles.map((r) => r.role) as Role[]) : ["leader"];

  const templates = await prisma.featureTemplate.findMany({
    where: { role: { in: roleList } },
    include: { items: true },
  });

  // map { [featureKey]: { view, edit, export, delete, admin } }
  const features: Record<string, Record<string, boolean>> = {};
  for (const t of templates) {
    for (const item of t.items) {
      if (!features[item.featureKey]) features[item.featureKey] = {};
      features[item.featureKey][item.action] =
        (features[item.featureKey][item.action] ?? false) || item.enabled;
    }
  }

  return { roles: roleList, features };
}

// -----------------------------------------------------------
// Bootstrap — cria templates default se não existirem
// -----------------------------------------------------------
export async function bootstrapFeatureTemplates() {
  try {
    for (const role of ROLES) {
      const def = TEMPLATE_DEFAULTS[role];
      if (!def) continue;
      const existing = await prisma.featureTemplate.findUnique({ where: { role } });
      // Template já existe: não sobrescreve o que o admin editou, mas as
      // features novas do catálogo (ex.: o módulo NR-1) precisam entrar — sem
      // esta linha, elas nunca apareceriam no template e o gating ficaria
      // fechado para todo mundo.
      const t =
        existing ??
        (await prisma.featureTemplate.create({
          data: { role, name: def.name, description: def.description },
        }));
      const rows: {
        templateId: string;
        featureKey: string;
        action: FeatureAction;
        enabled: boolean;
      }[] = [];
      for (const mod of FEATURE_CATALOG) {
        for (const feat of mod.features) {
          const enabledActions = def.enabled[feat.key] ?? [];
          for (const action of feat.actions) {
            rows.push({
              templateId: t.id,
              featureKey: feat.key,
              action,
              enabled: enabledActions.includes(action),
            });
          }
        }
      }
      if (rows.length) {
        // `skipDuplicates` mantém intactas as linhas que o admin já ajustou;
        // só entram as que faltavam.
        await prisma.featureTemplateItem.createMany({ data: rows, skipDuplicates: true });
      }
    }
    console.log("[bootstrap] feature templates garantidos");
  } catch (err) {
    console.error("[bootstrap] falha ao criar feature templates", err);
  }
}
