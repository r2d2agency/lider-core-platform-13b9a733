import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Monitor,
  Moon,
  RefreshCw,
  Settings2,
  Sun,
  Type,
} from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { useCurrentOrg } from "@/lib/use-current-org";
import { authApi } from "@/lib/api";
import {
  FONT_SCALE_LABELS,
  THEME_LABEL_MAP,
  useAppearance,
  type FontScale,
  type ThemePreference,
} from "@/lib/appearance-context";
import { applyUpdate, useAppUpdate } from "@/lib/use-app-update";

export const Route = createFileRoute("/_authenticated/app/settings")({
  ssr: false,
  component: SettingsPage,
});

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  icon: typeof Sun;
  hint: string;
}> = [
  { value: "light", icon: Sun, hint: "Fundo claro" },
  { value: "dark", icon: Moon, hint: "Fundo escuro" },
  { value: "system", icon: Monitor, hint: "Segue o celular" },
];

const FONT_SCALES: FontScale[] = ["sm", "md", "lg", "xl"];

function formatBuild(build: string | null): string {
  if (!build) return "—";
  const ts = Number(build);
  if (!Number.isFinite(ts) || ts <= 0) return build;
  const d = new Date(ts);
  return `${d.toLocaleDateString("pt-BR")} às ${d.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

function SettingsPage() {
  const { user } = useAuth();
  const { orgs, orgId, setOrgId, current } = useCurrentOrg();
  const { theme, setTheme, fontScale, setFontScale } = useAppearance();
  const { updateAvailable, checking, check } = useAppUpdate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("A nova senha precisa ter no mínimo 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("A confirmação não é igual à nova senha.");
      return;
    }
    setSavingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      toast.success("Senha alterada com sucesso.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível trocar a senha.");
    } finally {
      setSavingPassword(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-accent/10 text-accent">
          <Settings2 className="h-5 w-5" />
        </div>
        <div>
          <h1 className="font-display text-3xl font-semibold leading-tight">Configurações</h1>
          <p className="text-sm text-muted-foreground">Perfil, aparência, senha e atualizações.</p>
        </div>
      </header>

      {/* Perfil ------------------------------------------------------ */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Perfil
        </div>
        <div className="text-sm font-medium">{user?.fullName ?? "Sem nome"}</div>
        <div className="text-xs text-muted-foreground">{user?.email}</div>
        <Button asChild variant="outline" size="sm" className="mt-4">
          <Link to="/app/profile">
            Ver perfil completo
            <ArrowRight />
          </Link>
        </Button>
      </section>

      {/* Aparência --------------------------------------------------- */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Aparência
        </div>

        <div className="mb-2 text-sm font-medium">Modo</div>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const active = theme === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setTheme(opt.value)}
                aria-pressed={active}
                className={
                  "flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-xs transition " +
                  (active
                    ? "border-accent bg-accent/5 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary/40")
                }
              >
                <Icon className="h-4 w-4" />
                <span>{THEME_LABEL_MAP[opt.value]}</span>
                <span className="text-[10px] text-muted-foreground">{opt.hint}</span>
              </button>
            );
          })}
        </div>

        <div className="mb-2 mt-6 flex items-center gap-2 text-sm font-medium">
          <Type className="h-4 w-4" />
          Tamanho da fonte
        </div>
        <div className="grid grid-cols-4 gap-2">
          {FONT_SCALES.map((scale) => {
            const active = fontScale === scale;
            return (
              <button
                key={scale}
                type="button"
                onClick={() => setFontScale(scale)}
                aria-pressed={active}
                className={
                  "rounded-xl border px-2 py-3 text-center transition " +
                  (active
                    ? "border-accent bg-accent/5 font-medium text-foreground"
                    : "border-border text-muted-foreground hover:bg-secondary/40")
                }
              >
                <span
                  className={
                    scale === "sm"
                      ? "text-xs"
                      : scale === "md"
                        ? "text-sm"
                        : scale === "lg"
                          ? "text-base"
                          : "text-lg"
                  }
                >
                  A
                </span>
                <span className="mt-1 block text-[10px]">{FONT_SCALE_LABELS[scale]}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Segurança --------------------------------------------------- */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <KeyRound className="h-3.5 w-3.5" />
          Segurança
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          A nova senha deve ter no mínimo 8 caracteres.
        </p>
        <form onSubmit={handleChangePassword} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="current-password">
              Senha atual
            </label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="new-password">
              Nova senha
            </label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="confirm-password">
              Confirmar nova senha
            </label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={savingPassword}>
            {savingPassword ? <Loader2 className="animate-spin" /> : null}
            Trocar senha
          </Button>
        </form>
      </section>

      {/* Atualização -------------------------------------------------- */}
      <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
        <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Atualização
        </div>
        {updateAvailable ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-accent/30 bg-accent/5 p-3 text-sm">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
            <div className="flex-1">
              <p className="font-medium">Nova versão disponível</p>
              <p className="text-xs text-muted-foreground">
                Recarregue o app para usar a versão mais recente.
              </p>
              <Button size="sm" className="mt-2" onClick={() => void applyUpdate()}>
                <RefreshCw />
                Atualizar agora
              </Button>
            </div>
          </div>
        ) : (
          <p className="mb-4 text-xs text-muted-foreground">
            Você está na versão mais recente.
          </p>
        )}
        <div className="text-xs text-muted-foreground">
          Versão instalada:{" "}
          <span className="font-mono text-foreground">
            {formatBuild(
              document.querySelector<HTMLMetaElement>('meta[name="app-build"]')?.content ?? null,
            )}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={checking}
          onClick={() =>
            void check().then((found) =>
              found
                ? toast.success("Nova versão disponível.")
                : toast.success("Tudo atualizado."),
            )
          }
        >
          {checking ? <Loader2 className="animate-spin" /> : <RefreshCw />}
          Verificar atualizações
        </Button>
      </section>

      {/* Organização ativa (existente) -------------------------------- */}
      {orgs.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-6 shadow-sm">
          <div className="mb-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Organização ativa
          </div>
          <div className="space-y-2">
            {orgs.map((o) => (
              <label
                key={o.id}
                className={
                  "flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 text-sm transition " +
                  (orgId === o.id
                    ? "border-accent bg-accent/5"
                    : "border-border hover:bg-secondary/40")
                }
              >
                <span>
                  <span className="font-medium">{o.name}</span>{" "}
                  <span className="text-xs text-muted-foreground">· {o.plan}</span>
                </span>
                <input
                  type="radio"
                  name="org"
                  checked={orgId === o.id}
                  onChange={() => setOrgId(o.id)}
                />
              </label>
            ))}
          </div>
          {current && (
            <p className="mt-3 text-[11px] text-muted-foreground">Slug: {current.slug}</p>
          )}
        </section>
      )}
    </div>
  );
}
