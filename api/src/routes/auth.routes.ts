import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../prisma.js";
import { signToken, requireAuth } from "../auth.js";
import { resolveUserPermissions } from "../rbac.js";
import { randomInt } from "node:crypto";
import { sendEmail } from "../lib/notifications.js";

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(1),
  planSlug: z.string().min(1).optional(),
  inviteToken: z.string().min(1).optional(),
});

authRouter.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { password, fullName, planSlug, inviteToken } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Email já cadastrado" });

  // Convite (mentorado) — define trilha de onboarding e pode forçar o plano
  let invite: Awaited<ReturnType<typeof prisma.leaderInvite.findUnique>> = null;
  if (inviteToken) {
    invite = await prisma.leaderInvite.findUnique({ where: { token: inviteToken } }).catch(() => null);
    const invalid =
      !invite ||
      invite.revokedAt ||
      (invite.expiresAt && invite.expiresAt < new Date()) ||
      invite.usedCount >= invite.maxUses;
    if (invalid) return res.status(410).json({ error: "Convite inválido ou expirado" });
  }
  const track = invite?.track === "mentored" ? "mentored" : "basic";
  const effectivePlanSlug = invite?.planSlug ?? planSlug;

  // Resolve o plano selecionado (opcional)
  let plan: { slug: string; targetRole: "super_admin" | "neo_admin" | "franchise_owner" | "hr_admin" | "leader" | "collaborator"; planTier: "essencial" | "profissional" | "enterprise" } | null = null;
  if (effectivePlanSlug) {
    const found = await prisma.signupPlan.findUnique({ where: { slug: effectivePlanSlug } });
    if (found && found.active) {
      plan = { slug: found.slug, targetRole: found.targetRole, planTier: found.planTier };
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      profile: {
        create: {
          fullName,
          onboardingTrack: track,
          didNeoMentorship: track === "mentored",
          invitedByUserId: invite?.createdByUserId ?? null,
        },
      },
    },
  });

  if (invite) {
    await prisma.leaderInvite
      .update({ where: { id: invite.id }, data: { usedCount: { increment: 1 } } })
      .catch((err) => console.error("[auth] falha ao marcar convite usado", err));
  }

  // Aplica papel do plano selecionado (default = leader se nenhum plano foi passado)
  const roleToApply = plan?.targetRole ?? "leader";
  try {
    await prisma.userRole.create({ data: { userId: user.id, role: roleToApply } });
  } catch (err) {
    console.error("[auth] falha ao aplicar role no registro", err);
  }

  // Líderes independentes: cria organização pessoal para que o app tenha contexto.
  const rolesWithPersonalOrg = new Set(["leader", "franchise_owner", "hr_admin", "collaborator"]);
  if (rolesWithPersonalOrg.has(roleToApply)) {
    try {
      const base = (fullName || email.split("@")[0])
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "")
        .slice(0, 40) || "lider";
      const slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
      const orgName = fullName ? `Espaço de ${fullName.split(" ")[0]}` : "Meu espaço de liderança";
      await prisma.organization.create({
        data: {
          name: orgName,
          slug,
          plan: (plan?.planTier === "profissional" || plan?.planTier === "enterprise") ? "profissional" : "essencial",
          memberships: { create: { userId: user.id, role: roleToApply as never } },
        },
      });
    } catch (err) {
      console.error("[auth] falha ao criar organização pessoal no registro", err);
    }
  }

  const token = signToken({ sub: user.id, email: user.email });
  return res.status(201).json({
    token,
    user: { id: user.id, email: user.email, fullName },
    plan: plan ? { slug: plan.slug, role: plan.targetRole, tier: plan.planTier } : null,
    track,
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "Informe um email válido e a senha." });
    const { password } = parsed.data;
    const email = parsed.data.email.trim().toLowerCase();

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, passwordHash: true },
    });
    if (!user) return res.status(401).json({ error: "Usuário ou senha inválidos." });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Usuário ou senha inválidos." });

    const profile = await prisma.profile.findUnique({
      where: { id: user.id },
      select: { fullName: true, avatarUrl: true },
    }).catch((err) => {
      console.error("[auth] falha ao carregar perfil no login", err);
      return null;
    });

    const token = signToken({ sub: user.id, email: user.email });
    return res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: profile?.fullName ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
      },
    });
  } catch (err) {
    console.error("[auth] falha no login", err);
    return res.status(500).json({ error: "Não foi possível entrar agora. Tente novamente em instantes." });
  }
});

authRouter.get("/me", requireAuth, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId! },
      include: {
        roles: { select: { role: true } },
        memberships: {
          include: { organization: { select: { id: true, name: true, slug: true, plan: true } } },
        },
        franchiseMemberships: {
          include: { franchise: { select: { id: true, name: true, slug: true, status: true } } },
        },
      },
    });
    if (!user) return res.status(404).json({ error: "Not found" });

    const profile = await prisma.profile.findUnique({
      where: { id: req.userId! },
      select: {
        fullName: true,
        avatarUrl: true,
        jobTitle: true,
        phone: true,
        whatsapp: true,
        onboardingCompletedAt: true,
        onboardingSteps: true,
        onboardingTrack: true,
        didNeoMentorship: true,
      },
    }).catch((err) => {
      console.error("[auth] falha ao carregar perfil em /me", err);
      return null;
    });

    return res.json({
      id: user.id,
      email: user.email,
      fullName: profile?.fullName ?? null,
      avatarUrl: profile?.avatarUrl ?? null,
      jobTitle: profile?.jobTitle ?? null,
      phone: profile?.phone ?? null,
      whatsapp: profile?.whatsapp ?? null,
      onboardingCompletedAt: profile?.onboardingCompletedAt ?? null,
      onboardingSteps: profile?.onboardingSteps ?? null,
      onboardingTrack: profile?.onboardingTrack ?? "basic",
      didNeoMentorship: profile?.didNeoMentorship ?? false,
      roles: user.roles.map((r: { role: string }) => r.role),
      memberships: user.memberships.map((m: { role: string; organization: { id: string; name: string; slug: string; plan: string } }) => ({
        role: m.role,
        organization: m.organization,
      })),
      franchiseMemberships: user.franchiseMemberships.map((m: { role: string; franchise: { id: string; name: string; slug: string; status: string } }) => ({
        role: m.role,
        franchise: m.franchise,
      })),
    });
  } catch (err) {
    console.error("[auth] falha em /me", err);
    return res.status(500).json({ error: "Não foi possível carregar sua sessão agora." });
  }
});

authRouter.get("/me/permissions", requireAuth, async (req, res) => {
  const perms = await resolveUserPermissions(req.userId!);
  res.json(perms);
});

// -----------------------------------------------------------
// Onboarding do líder — marca etapas concluídas e o término.
// Também aceita salvar dados básicos de perfil (nome, cargo,
// telefone/WhatsApp) durante o fluxo.
// -----------------------------------------------------------
authRouter.post("/me/onboarding", requireAuth, async (req, res) => {
  const body = (req.body ?? {}) as {
    step?: string;
    completed?: boolean;
    profile?: {
      fullName?: string;
      jobTitle?: string;
      phone?: string;
      whatsapp?: string;
    };
  };

  const current = await prisma.profile.findUnique({ where: { id: req.userId! } });
  const steps =
    (current?.onboardingSteps as Record<string, string> | null | undefined) ?? {};
  if (body.step) steps[body.step] = new Date().toISOString();

  const data: Record<string, unknown> = {
    onboardingSteps: steps as never,
  };
  if (body.completed) data.onboardingCompletedAt = new Date();
  if (body.profile) {
    if (typeof body.profile.fullName === "string") data.fullName = body.profile.fullName.trim();
    if (typeof body.profile.jobTitle === "string") data.jobTitle = body.profile.jobTitle.trim();
    if (typeof body.profile.phone === "string") data.phone = body.profile.phone.trim();
    if (typeof body.profile.whatsapp === "string") data.whatsapp = body.profile.whatsapp.trim();
  }

  const updated = await prisma.profile.upsert({
    where: { id: req.userId! },
    update: data,
    create: { id: req.userId!, ...data },
  });
  res.json({
    ok: true,
    onboardingCompletedAt: updated.onboardingCompletedAt,
    onboardingSteps: updated.onboardingSteps,
  });
});

const forgotPasswordSchema = z.object({ email: z.string().email() });

authRouter.post("/forgot-password", async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Informe um email válido." });
  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });

  // A resposta é sempre igual para não revelar quais e-mails possuem cadastro.
  if (!user) return res.json({ ok: true });
  const recent = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } },
  });
  if (recent) return res.status(429).json({ error: "Aguarde um minuto antes de solicitar outro código." });

  const code = String(randomInt(100000, 1000000));
  const reset = await prisma.passwordResetCode.create({
    data: {
      userId: user.id,
      codeHash: await bcrypt.hash(code, 10),
      expiresAt: new Date(Date.now() + 15 * 60_000),
    },
  });
  try {
    await sendEmail({
      to: email,
      subject: "Código temporário para redefinir sua senha",
      text: `Seu código temporário é ${code}. Ele expira em 15 minutos. Se você não solicitou a redefinição, ignore este e-mail.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.5;color:#172033"><h2>Redefinição de senha</h2><p>Use o código temporário abaixo para cadastrar uma nova senha:</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>O código expira em 15 minutos e só pode ser usado uma vez.</p><p>Se você não fez esta solicitação, ignore este e-mail.</p></div>`,
    });
  } catch (error) {
    await prisma.passwordResetCode.delete({ where: { id: reset.id } }).catch(() => undefined);
    console.error("[auth] falha ao enviar código de redefinição", error);
    return res.status(503).json({ error: "Não foi possível enviar o e-mail agora. Tente novamente em instantes." });
  }
  return res.json({ ok: true });
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
  newPassword: z.string().min(8),
});

authRouter.post("/reset-password", async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Informe o código de 6 dígitos e uma senha com pelo menos 8 caracteres." });
  }
  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return res.status(400).json({ error: "Código inválido ou expirado." });

  const reset = await prisma.passwordResetCode.findFirst({
    where: { userId: user.id, usedAt: null },
    orderBy: { createdAt: "desc" },
  });
  if (!reset || reset.expiresAt < new Date() || reset.attempts >= 5) {
    return res.status(400).json({ error: "Código inválido ou expirado." });
  }
  const valid = await bcrypt.compare(parsed.data.code, reset.codeHash);
  if (!valid) {
    await prisma.passwordResetCode.update({ where: { id: reset.id }, data: { attempts: { increment: 1 } } });
    return res.status(400).json({ error: "Código inválido ou expirado." });
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
    prisma.passwordResetCode.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: now } }),
  ]);
  return res.json({ ok: true });
});
