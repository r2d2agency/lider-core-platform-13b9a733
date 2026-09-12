import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { ApiError, authApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Logo } from "@/components/brand/Logo";

type SignupPlan = { slug: string; name: string; description: string | null; targetRole: string; planTier: string };

export const Route = createFileRoute("/auth")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    invite: typeof search.invite === "string" ? search.invite : undefined,
    mode: (search.mode === "signup" || search.mode === "signin") ? search.mode : undefined,
  }) as { invite?: string; mode?: "signup" | "signin" },
  head: () => ({
    meta: [
      { title: "Entrar — LÍDER C.O.R.E." },
      { name: "description", content: "Acesse a plataforma LÍDER C.O.R.E." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { invite: inviteToken, mode: searchMode } = Route.useSearch();
  const { user, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot" | "reset">(searchMode || "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [planSlug, setPlanSlug] = useState<string>("");

  const { data: plansData } = useQuery({
    queryKey: ["signup-plans"],
    queryFn: () => authApi.listSignupPlans(),
    enabled: mode === "signup",
    staleTime: 60_000,
  });
  const plans: SignupPlan[] = plansData?.plans ?? [];

  const { data: invite } = useQuery({
    queryKey: ["invite", inviteToken],
    queryFn: () => authApi.resolveInvite(inviteToken!),
    enabled: !!inviteToken,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!inviteToken) return;
    setMode("signup");
  }, [inviteToken]);

  useEffect(() => {
    if (!invite) return;
    if (invite.email) setEmail((cur) => cur || invite.email!);
    if (invite.fullName) setFullName((cur) => cur || invite.fullName!);
    if (invite.plan?.slug) setPlanSlug(invite.plan.slug);
  }, [invite]);

  useEffect(() => {
    if (mode === "signup" && plans.length > 0 && !planSlug) {
      setPlanSlug(plans[0].slug);
    }
  }, [mode, plans, planSlug]);

  useEffect(() => {
    if (user) {
      const dest = user.roles?.includes("super_admin") ? "/admin" : "/app";
      navigate({ to: dest, replace: true });
    }
  }, [user, navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setFormError(null);
    try {
      if (mode === "forgot") {
        await authApi.forgotPassword(email);
        setMode("reset");
        toast.success("Se o e-mail estiver cadastrado, você receberá o código temporário.");
        return;
      }
      if (mode === "reset") {
        if (password !== confirmPassword) throw new Error("As senhas não coincidem.");
        await authApi.resetPassword(email, resetCode, password);
        setMode("signin");
        setPassword("");
        setConfirmPassword("");
        setResetCode("");
        toast.success("Senha cadastrada. Agora você já pode entrar.");
        return;
      }
      if (mode === "signin") {
        await signIn(email, password);
        toast.success("Bem-vindo de volta.");
      } else {
        await signUp(email, password, fullName, planSlug || undefined, inviteToken);
        toast.success("Conta criada.");
      }
      // Redirect handled by the useEffect above once `user` populates.
    } catch (err: unknown) {
      const message =
        err instanceof ApiError && err.status === 401
          ? "Usuário ou senha inválidos. Confira os dados e tente novamente."
          : err instanceof ApiError && err.status === 0
            ? "Não conseguimos conectar ao servidor agora. Tente novamente em instantes."
            : err instanceof Error
              ? err.message
              : "Erro ao autenticar";
      setFormError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen bg-background md:grid-cols-2">
      {/* Painel esquerdo — marca */}
      <aside className="relative hidden overflow-hidden bg-primary p-12 text-primary-foreground md:flex md:flex-col md:justify-between">
        <div className="absolute inset-0 bg-grid opacity-10" />
        <Link to="/" className="relative flex items-center gap-2">
          <Logo variant="mark" className="h-9 w-9" />
          <span className="font-display text-lg font-bold uppercase tracking-wider">Líder C.O.R.E.</span>
        </Link>
        <div className="relative">
          <p className="font-display text-3xl leading-tight md:text-4xl">
            "O líder não entra no sistema para preencher formulários.
            <br />
            Ele entra para <em className="text-accent">liderar</em>."
          </p>
          <p className="mt-6 text-sm text-primary-foreground/70">
            Neo Pessoas · Metodologia C.O.R.E.
          </p>
        </div>
      </aside>

      <main className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="md:hidden mb-8 flex items-center gap-2">
            <Logo variant="mark" className="h-8 w-8" />
            <span className="font-display text-lg font-bold uppercase tracking-wider">Líder C.O.R.E.</span>
          </div>
          <h1 className="font-display text-3xl">
            {mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : mode === "forgot" ? "Esqueci minha senha" : "Cadastrar nova senha"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {mode === "signin"
              ? "Acesse sua rotina de liderança."
              : mode === "signup"
                ? "Comece a usar o LÍDER C.O.R.E."
                : mode === "forgot"
                  ? "Informe seu e-mail para receber um código temporário."
                  : "Digite o código recebido por e-mail e escolha sua nova senha."}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="name">Nome completo</Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
            )}
            {mode === "signup" && invite?.valid && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-3">
                <p className="text-sm font-medium">
                  {invite.track === "mentored"
                    ? "Convite de mentorado Neo"
                    : "Convite de acesso"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {invite.track === "mentored"
                    ? "Sua conta já entra com a jornada completa da metodologia C.O.R.E. liberada no onboarding."
                    : "Sua conta será criada com o plano indicado no convite."}
                  {invite.plan ? ` Plano: ${invite.plan.name}.` : ""}
                </p>
                {invite.note && (
                  <p className="mt-2 text-xs italic text-muted-foreground">"{invite.note}"</p>
                )}
              </div>
            )}
            {mode === "signup" && !invite?.plan && plans.length > 0 && (
              <div className="space-y-2">
                <Label>Plano de acesso</Label>
                <div className="grid gap-2">
                  {plans.map((p) => {
                    const selected = planSlug === p.slug;
                    return (
                      <button
                        type="button"
                        key={p.slug}
                        onClick={() => setPlanSlug(p.slug)}
                        className={`text-left rounded-lg border px-3 py-2.5 transition ${
                          selected
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium text-sm">{p.name}</span>
                          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                            {p.planTier}
                          </span>
                        </div>
                        {p.description && (
                          <p className="mt-1 text-xs text-muted-foreground">{p.description}</p>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {mode === "reset" && (
              <div className="space-y-1.5">
                <Label htmlFor="reset-code">Código temporário</Label>
                <Input
                  id="reset-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  required
                  className="text-center text-lg tracking-[0.35em]"
                />
              </div>
            )}
            {mode !== "forgot" && <div className="space-y-1.5">
              <Label htmlFor="password">Senha</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete={mode === "signin" ? "current-password" : "new-password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setFormError(null);
                  }}
                  required
                  minLength={8}
                  className="pr-11"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
                  className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>}
            {mode === "reset" && (
              <div className="space-y-1.5">
                <Label htmlFor="confirm-password">Confirmar nova senha</Label>
                <Input id="confirm-password" type={showPassword ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8} />
              </div>
            )}
            {mode === "signin" && (
              <button type="button" className="block text-sm font-medium text-primary underline-offset-4 hover:underline" onClick={() => { setMode("forgot"); setFormError(null); }}>
                Esqueci minha senha
              </button>
            )}
            {formError && (
              <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {formError}
              </p>
            )}
            <Button type="submit" className="w-full h-11" disabled={loading}>
              {loading ? "Carregando..." : mode === "signin" ? "Entrar" : mode === "signup" ? "Criar conta" : mode === "forgot" ? "Enviar código por e-mail" : "Cadastrar nova senha"}
            </Button>
          </form>

          {(mode === "signin" || mode === "signup") ? <p className="mt-6 text-center text-sm text-muted-foreground">
            {mode === "signin" ? "Ainda não tem conta?" : "Já tem uma conta?"}{" "}
            <button
              type="button"
              className="font-medium text-foreground underline underline-offset-4"
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            >
              {mode === "signin" ? "Criar conta" : "Entrar"}
            </button>
          </p> : <div className="mt-6 flex justify-center gap-4 text-sm">
            {mode === "reset" && <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => setMode("forgot")}>Reenviar código</button>}
            <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => setMode("signin")}>Voltar para o login</button>
          </div>}
        </div>
      </main>
    </div>
  );
}
