import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { useFeatures } from "@/lib/features";
import {
  Brain,
  Calendar,
  Compass,
  Gauge,
  Home,
  LogOut,
  MessageSquare,
  MoreHorizontal,
  Sparkles,
  Target,
  Users,
  Zap,
  BookOpen,
  Building,
  HelpCircle,
  UsersRound,
  Activity,
  Radar,
  Mic,
  Plus,
  UserCircle2,
  Settings2,
  Bell,
  NotebookPen,
  Grid3X3,
  CheckCircle2,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { LeaderOnboarding } from "@/components/onboarding/LeaderOnboarding";
import { TeamHealthPill } from "@/components/team/TeamHealthPill";
import { useCurrentOrg } from "@/lib/use-current-org";
import { api } from "@/lib/api";
import { VoiceCapture, type VoiceIntent } from "@/components/voice/VoiceCapture";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/app")({
  ssr: false,
  component: AppShell,
});

// module = which feature module gates the item. "*" = always show.
const nav = [
  { to: "/app", label: "Hoje", icon: Home, section: "Consciência", module: "consciencia" },
  {
    to: "/app/journey",
    label: "Jornada",
    icon: Compass,
    section: "Consciência",
    module: "consciencia",
  },
  {
    to: "/app/journey-progress",
    label: "Progresso C.O.R.E.",
    icon: Gauge,
    section: "Consciência",
    module: "consciencia",
  },
  {
    to: "/app/consciencia",
    label: "Meu perfil",
    icon: Brain,
    section: "Consciência",
    module: "consciencia",
  },
  {
    to: "/app/team",
    label: "Minha equipe",
    icon: Users,
    section: "Consciência",
    module: "consciencia",
  },
  {
    to: "/app/ninebox",
    label: "9-Box do time",
    icon: Grid3X3,
    section: "Consciência",
    module: "consciencia",
  },
  {
    to: "/app/organization",
    label: "Organização",
    icon: Building,
    section: "Organização",
    module: "organizacao",
  },
  {
    to: "/app/one-on-ones",
    label: "1:1s",
    icon: MessageSquare,
    section: "Organização",
    module: "organizacao",
  },
  {
    to: "/app/consciencia/agenda",
    label: "Agenda do líder",
    icon: Calendar,
    section: "Organização",
    module: "organizacao",
  },
  {
    to: "/app/indicators",
    label: "Indicadores",
    icon: Target,
    section: "Resultado",
    module: "resultado",
  },
  {
    to: "/app/results",
    label: "Gestão à vista",
    icon: Activity,
    section: "Resultado",
    module: "resultado",
  },
  {
    to: "/app/organization/cycles",
    label: "Metas do time",
    icon: CheckCircle2,
    section: "Resultado",
    module: "resultado",
  },
  { to: "/app/evolution", label: "Evolução", icon: Gauge, section: "Evolução", module: "evolucao" },
  {
    to: "/app/cycle-closure",
    label: "Fechamento de ciclo",
    icon: CheckCircle2,
    section: "Evolução",
    module: "evolucao",
  },
  { to: "/app/pdis", label: "PDIs", icon: BookOpen, section: "Evolução", module: "evolucao" },
  { to: "/app/360", label: "360 leve", icon: UsersRound, section: "Evolução", module: "evolucao" },
  {
    to: "/app/feedbacks",
    label: "Feedbacks",
    icon: Compass,
    section: "Evolução",
    module: "evolucao",
  },
  {
    to: "/app/coach",
    label: "Coach preditivo",
    icon: Radar,
    section: "Evolução",
    module: "evolucao",
  },
  { to: "/app/notes", label: "Notas & reuniões", icon: NotebookPen, section: "Base", module: "*" },
  { to: "/app/ai", label: "Assistente IA", icon: Sparkles, section: "Base", module: "*" },
  { to: "/app/profile", label: "Perfil", icon: UserCircle2, section: "Conta", module: "*" },
  { to: "/app/notifications", label: "Notificações", icon: Bell, section: "Conta", module: "*" },
  { to: "/app/settings", label: "Configurações", icon: Settings2, section: "Conta", module: "*" },
  { to: "/app/help", label: "Ajuda", icon: HelpCircle, section: "Ajuda", module: "*" },
] as const;

const mobileNav = [
  { to: "/app", label: "Início", icon: Home, module: "consciencia" },
  { to: "/app/organization/agenda", label: "Agenda", icon: Calendar, module: "organizacao" },
  { to: "/app/team", label: "Equipe", icon: Users, module: "consciencia" },
  { to: "/app/notes", label: "Notas", icon: NotebookPen, module: "*" },
  { to: "/app/ai", label: "Assistente IA", icon: Sparkles, module: "*" },
  { to: "/app/help", label: "Mais", icon: MoreHorizontal, module: "*" },
] as const;

const conscienciaOnlyNav = [
  { to: "/app", label: "Hoje", icon: Home, section: "Consciência", module: "consciencia" },
  {
    to: "/app/consciencia",
    label: "Meu perfil",
    icon: Brain,
    section: "Consciência",
    module: "consciencia",
  },
  {
    to: "/app/journey",
    label: "Jornada",
    icon: Compass,
    section: "Consciência",
    module: "consciencia",
  },
  {
    to: "/app/team",
    label: "Minha equipe",
    icon: Users,
    section: "Consciência",
    module: "consciencia",
  },
  {
    to: "/app/consciencia/agenda",
    label: "Agenda do líder",
    icon: Calendar,
    section: "Consciência",
    module: "consciencia",
  },
  { to: "/app/notes", label: "Notas & reuniões", icon: NotebookPen, section: "Base", module: "*" },
  { to: "/app/ai", label: "Assistente IA", icon: Sparkles, section: "Base", module: "*" },
  { to: "/app/profile", label: "Perfil", icon: UserCircle2, section: "Conta", module: "*" },
  { to: "/app/notifications", label: "Notificações", icon: Bell, section: "Conta", module: "*" },
  { to: "/app/settings", label: "Configurações", icon: Settings2, section: "Conta", module: "*" },
  { to: "/app/help", label: "Ajuda", icon: HelpCircle, section: "Ajuda", module: "*" },
] as const;

const conscienciaOnlyMobileNav = [
  { to: "/app", label: "Hoje", icon: Home, module: "consciencia" },
  { to: "/app/consciencia/agenda", label: "Agenda", icon: Calendar, module: "consciencia" },
  { to: "/app/consciencia", label: "Perfil", icon: Brain, module: "consciencia" },
  { to: "/app/team", label: "Equipe", icon: Users, module: "consciencia" },
  { to: "/app/notes", label: "Notas", icon: NotebookPen, module: "*" },
  { to: "/app/ai", label: "IA", icon: Sparkles, module: "*" },
] as const;

type ShellNavItem = {
  to: (typeof nav)[number]["to"] | (typeof conscienciaOnlyNav)[number]["to"];
  label: string;
  icon: (typeof nav)[number]["icon"];
  section: string;
  module: string;
};

function sectionColor(section: string) {
  return section === "Consciência"
    ? "var(--pilar-c)"
    : section === "Organização"
      ? "var(--pilar-o)"
      : section === "Resultado"
        ? "var(--pilar-r)"
        : section === "Evolução"
          ? "var(--pilar-e)"
          : "var(--accent)";
}

const productModuleTabs = [
  { module: "consciencia", section: "Consciência", to: "/app/consciencia" },
  { module: "organizacao", section: "Organização", to: "/app/organization" },
  { module: "resultado", section: "Resultado", to: "/app/indicators" },
  { module: "evolucao", section: "Evolução", to: "/app/evolution" },
] as const;

function isModuleActive(pathname: string, module: (typeof productModuleTabs)[number]["module"]) {
  if (module === "consciencia") {
    return (
      pathname === "/app" ||
      (pathname.startsWith("/app/consciencia") &&
        !pathname.startsWith("/app/consciencia/agenda")) ||
      pathname.startsWith("/app/journey") ||
      pathname.startsWith("/app/team") ||
      pathname.startsWith("/app/ninebox")
    );
  }
  if (module === "organizacao") {
    return (
      (pathname.startsWith("/app/organization") &&
        !pathname.startsWith("/app/organization/cycles")) ||
      pathname.startsWith("/app/one-on-ones") ||
      pathname.startsWith("/app/consciencia/agenda")
    );
  }
  if (module === "resultado") {
    return (
      pathname.startsWith("/app/indicators") ||
      pathname.startsWith("/app/results") ||
      pathname.startsWith("/app/organization/cycles")
    );
  }
  if (module === "evolucao") {
    return (
      pathname.startsWith("/app/evolution") ||
      pathname.startsWith("/app/cycle-closure") ||
      pathname.startsWith("/app/pdis") ||
      pathname.startsWith("/app/360") ||
      pathname.startsWith("/app/feedbacks") ||
      pathname.startsWith("/app/coach")
    );
  }
  return false;
}

function AppShell() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { signOut, user } = useAuth();
  const { orgId } = useCurrentOrg();
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  // Detecta a plataforma: no desktop mostramos a versão completa com sidebar.
  useEffect(() => {
    const saved = window.localStorage.getItem("lc:sidebar-collapsed");
    if (saved === "1") setCollapsed(true);
  }, []);
  const toggleSidebar = () => {
    setCollapsed((c) => {
      const next = !c;
      window.localStorage.setItem("lc:sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  };
  const featuresQ = useFeatures();
  const roles = featuresQ.data?.roles ?? [];
  const isAdmin = roles.includes("super_admin") || roles.includes("neo_admin");
  const enabledModules = (() => {
    if (isAdmin) return null; // null = show all
    // Durante o loading não escondemos módulos; se falhar, fechamos a UI.
    if (featuresQ.isLoading) return null;
    if (!featuresQ.data) return new Set<string>();
    const set = new Set<string>();
    const feats = featuresQ.data?.features ?? {};
    for (const key of Object.keys(feats)) {
      const anyOn = Object.values(feats[key] ?? {}).some(Boolean);
      if (anyOn) set.add(key.split(".")[0]);
    }
    return set;
  })();
  const isModuleAllowed = (mod: string) =>
    mod === "*" || !enabledModules || enabledModules.has(mod);

  const conscienciaOnly =
    !!enabledModules && enabledModules.size === 1 && enabledModules.has("consciencia");
  const baseNav = conscienciaOnly ? conscienciaOnlyNav : nav;
  const baseMobileNav = conscienciaOnly ? conscienciaOnlyMobileNav : mobileNav;
  const quickActionTo = conscienciaOnly
    ? "/app/consciencia/agenda"
    : "/app/organization/delegations";

  const visibleNav = baseNav.filter((n) => isModuleAllowed(n.module));
  const visibleMobileNav = baseMobileNav.filter((n) => isModuleAllowed(n.module));

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    signOut();
    toast.success("Até logo.");
    navigate({ to: "/auth", search: {}, replace: true } as any);
  };

  const handleVoiceIntent = async (intent: VoiceIntent) => {
    if (!orgId) return;
    try {
      // Notas viram registro na Base do líder (Notas & reuniões).
      if (intent.tipo === "nota") {
        await api(`/organization/${orgId}/base/notes`, {
          method: "POST",
          body: {
            kind: "nota",
            title: intent.titulo || intent.resumo.slice(0, 80) || "Nota por voz",
            content: intent.resumo || intent.transcricao,
            transcript: intent.transcricao,
            source: "voz",
            participants: intent.membroSugerido ? [intent.membroSugerido] : [],
            meetingAt: null,
          },
        });
        await queryClient.invalidateQueries({ queryKey: ["base-notes", orgId] });
        setVoiceOpen(false);
        toast.success("Nota salva na Base do líder.");
        navigate({ to: "/app/notes" });
        return;
      }

      if (conscienciaOnly) {
        await api(`/organization/${orgId}/consciencia/agenda`, {
          method: "POST",
          body: {
            title: intent.titulo || intent.resumo.slice(0, 90) || "Registro por voz",
            detail: intent.resumo || intent.transcricao,
            kind:
              intent.tipo === "delegacao"
                ? "delegacao"
                : intent.tipo === "feedback"
                  ? "feedback"
                  : intent.tipo === "agenda"
                    ? "acao"
                    : "acao",
            memberLabel: intent.membroSugerido ?? null,
            scheduledAt: intent.prazoISO ?? null,
            source: "voice",
          },
        });
        await queryClient.invalidateQueries({ queryKey: ["agenda", orgId] });
        setVoiceOpen(false);
        toast.success("Voz registrada na agenda de liderança.");
        navigate({ to: "/app/consciencia/agenda" });
        return;
      }

      if (typeof window !== "undefined") {
        const key =
          intent.tipo === "feedback"
            ? "voice-draft-feedback"
            : intent.tipo === "delegacao"
              ? "voice-draft-delegacao"
              : "voice-draft-nota";
        window.sessionStorage.setItem(key, JSON.stringify(intent));
      }
      setVoiceOpen(false);
      if (intent.tipo === "feedback") {
        toast.success("Feedback capturado", { description: "Abrindo Feedbacks…" });
        navigate({ to: "/app/feedbacks" });
      } else {
        toast.success("Delegação capturada", { description: "Abrindo Delegações…" });
        navigate({ to: "/app/organization/delegations" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Falha ao processar áudio");
    }
  };

  const grouped = visibleNav.reduce<Record<string, ShellNavItem[]>>((acc, item) => {
    (acc[item.section] ||= []).push(item);
    return acc;
  }, {});

  const isActiveRoute = (to: string) => {
    if (to === "/app") return pathname === "/app";
    if (to === "/app/consciencia") return pathname === "/app/consciencia";
    return pathname === to || pathname.startsWith(to + "/");
  };

  const currentLabel = visibleNav.find((n) => isActiveRoute(n.to))?.label ?? "Sala de liderança";
  const currentNavItem = visibleNav.find((n) => isActiveRoute(n.to)) ?? null;
  const currentSection = currentNavItem?.section ?? "Navegação";
  const sectionTabs = productModuleTabs.map((tab) => ({
    ...tab,
    active: isModuleActive(pathname, tab.module),
    color: sectionColor(tab.section),
  }));
  const initials = (user?.fullName || user?.email || "L")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");

  return (
    <div
      className={
        "min-h-screen bg-background text-foreground md:grid " +
        (collapsed ? "md:grid-cols-[76px_1fr]" : "md:grid-cols-[264px_1fr]")
      }
    >
      <aside className="sticky top-0 hidden h-screen border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:flex md:flex-col">
        <div
          className={
            "flex items-center gap-3 border-b border-sidebar-border py-5 " +
            (collapsed ? "justify-center px-2" : "px-5")
          }
        >
          {collapsed ? (
            <Logo variant="mark" className="h-8 w-8 rounded-lg" />
          ) : (
            <>
              <Logo className="h-7 w-auto max-w-[150px]" />
              <span className="ml-auto text-[10px] uppercase tracking-widest text-muted-foreground">
                Neo
              </span>
            </>
          )}
        </div>

        <nav className={"flex-1 overflow-y-auto py-5 " + (collapsed ? "px-2" : "px-3")}>
          {Object.entries(grouped).map(([section, items]) => (
            <div key={section} className="mb-5">
              {!collapsed && (
                <div
                  className="mb-2 px-3 text-[10px] font-medium uppercase tracking-widest"
                  style={{ color: sectionColor(section) }}
                >
                  {section}
                </div>
              )}
              <ul className="space-y-0.5">
                {items.map(({ to, label, icon: Icon, section }) => {
                  const active = isActiveRoute(to);
                  const pilarColor = sectionColor(section);

                  return (
                    <li key={to}>
                      <Link
                        to={to}
                        search={{}}
                        title={collapsed ? label : undefined}
                        style={{
                          color: active ? pilarColor : undefined,
                          backgroundColor: active
                            ? `color-mix(in oklab, ${pilarColor} 10%, transparent)`
                            : undefined,
                        }}
                        className={
                          "flex items-center rounded-lg text-sm transition-colors " +
                          (collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2") +
                          " " +
                          (active
                            ? "font-semibold"
                            : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground")
                        }
                      >
                        <Icon
                          className="h-4 w-4 shrink-0"
                          strokeWidth={active ? 2.5 : 1.75}
                          style={{ color: active ? pilarColor : undefined }}
                        />

                        {!collapsed && <span className="truncate">{label}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div
            className={
              "flex items-center gap-3 rounded-xl bg-sidebar-accent/40 p-2 " +
              (collapsed ? "justify-center" : "")
            }
          >
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{user?.fullName ?? "Líder"}</div>
                <div className="truncate text-[11px] text-muted-foreground">{user?.email}</div>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleSignOut}
                title="Sair"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={toggleSidebar}
            className={
              "mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground " +
              (collapsed ? "justify-center px-0" : "")
            }
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" /> Recolher menu
              </>
            )}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border/60 bg-background/85 px-5 py-3 backdrop-blur md:px-8 md:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <Logo className="h-6 w-auto max-w-[130px] md:hidden" />
            <div className="min-w-0 md:hidden">
              <div
                className="text-[10px] uppercase tracking-widest"
                style={{ color: sectionColor(currentSection) }}
              >
                {currentSection}
              </div>
              <div className="truncate text-sm font-medium">{currentLabel}</div>
            </div>
          </div>
          <div className="hidden min-w-0 md:block">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest">
              <span>{formatTodayBr()}</span>
              <span>•</span>
              <span style={{ color: sectionColor(currentSection) }}>{currentSection}</span>
            </div>
            <div className="truncate text-sm font-medium">{currentLabel}</div>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {orgId && (
              <>
                <button
                  type="button"
                  onClick={() => setVoiceOpen(true)}
                  className="hidden items-center gap-2 rounded-full border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:border-accent/50 hover:text-foreground md:inline-flex"
                >
                  <Mic className="h-4 w-4" /> Ditar
                </button>
                <Link
                  to={quickActionTo}
                  className="hidden items-center gap-2 rounded-full bg-accent px-4 py-2 text-xs font-semibold text-white shadow-[0_10px_24px_-14px_color-mix(in_oklab,var(--accent)_70%,transparent)] transition hover:brightness-105 md:inline-flex"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.5} /> Nova ação
                </Link>
              </>
            )}
            <TeamHealthPill orgId={orgId} />
            <NotificationBell />
            <div
              className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-secondary text-sm font-medium ring-2"
              style={{ borderColor: "var(--pilar-c)" }}
            >
              <Logo variant="mark" className="h-8 w-8 rounded-full" />
            </div>
          </div>
        </header>
        <div className="sticky top-[61px] z-20 border-b border-border/60 bg-background/92 backdrop-blur md:top-[73px]">
          <div className="mx-auto flex w-full max-w-[1200px] items-center gap-2 overflow-x-auto px-4 py-2 md:px-8 xl:px-12">
            {sectionTabs.map((tab) => (
              <Link
                key={tab.section}
                to={tab.to!}
                search={{}}
                style={{
                  color: tab.color,
                  borderColor: `color-mix(in oklab, ${tab.color} 30%, var(--border))`,
                  backgroundColor: `color-mix(in oklab, ${tab.color} ${tab.active ? "14%" : "8%"}, transparent)`,
                }}
                className={
                  "inline-flex shrink-0 items-center rounded-full border px-3 py-1.5 text-xs font-medium transition-colors " +
                  (tab.active ? "font-semibold shadow-sm" : "hover:brightness-105")
                }
              >
                {tab.section}
              </Link>
            ))}
          </div>
        </div>
        <main className="flex-1 px-4 py-5 pb-28 md:px-8 md:py-10 md:pb-14 xl:px-12">
          <div className="mx-auto w-full max-w-[1200px]">
            <Outlet />
          </div>
        </main>
        <LeaderOnboarding />

        {/* Ações globais do líder: ficam acima do menu inferior em qualquer tela do app. */}
        {orgId && (
          <div
            className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 md:hidden"
            style={{ bottom: "calc(5.25rem + env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              onClick={() => setVoiceOpen(true)}
              aria-label="Ditar ação por voz"
              className="grid h-12 w-12 place-items-center rounded-full border border-border bg-background text-foreground shadow-[0_10px_24px_-12px_rgba(0,0,0,0.35)] transition active:scale-95"
            >
              <Mic className="h-5 w-5" strokeWidth={2} />
            </button>
            <Link
              to={quickActionTo}
              aria-label={conscienciaOnly ? "Novo item na agenda" : "Nova ação"}
              className="grid h-14 w-14 place-items-center rounded-full bg-accent text-white shadow-[0_16px_36px_-10px_color-mix(in_oklab,var(--accent)_60%,transparent)] transition active:scale-95"
            >
              <Plus className="h-6 w-6" strokeWidth={2.5} />
            </Link>
          </div>
        )}

        <Dialog open={voiceOpen} onOpenChange={setVoiceOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Captura por voz</DialogTitle>
              <DialogDescription>
                {conscienciaOnly
                  ? "Fale uma ação, feedback ou lembrete. Notas vão para a Base do líder; o resto entra na Agenda."
                  : "Fale um feedback, delegação ou nota. A IA transcreve, classifica e leva você direto para o lugar certo."}
              </DialogDescription>
            </DialogHeader>
            {orgId && (
              <div className="pt-2">
                <VoiceCapture
                  orgId={orgId}
                  onConfirm={handleVoiceIntent}
                  label="Toque para gravar"
                  variant="panel"
                />
                <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
                  Exemplos: <em>"Anotar que a Ana pediu mais autonomia"</em> ·{" "}
                  <em>"Dar feedback positivo à Ana"</em> ·{" "}
                  <em>"Delegar ao João o relatório até sexta"</em>.
                </p>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Bottom navigation (mobile) */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden">
          <ul className="mx-auto flex max-w-3xl items-center" style={{ width: "100%" }}>
            {visibleMobileNav.map(({ to, label, icon: Icon }) => {
              const active = isActiveRoute(to);
              return (
                <li key={to} className="flex-1">
                  <Link
                    to={to}
                    search={{}}
                    className={
                      "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors " +
                      (active ? "text-accent" : "text-muted-foreground")
                    }
                  >
                    <span
                      className={
                        "grid h-9 w-9 place-items-center rounded-full transition-colors " +
                        (active ? "bg-accent/10" : "")
                      }
                    >
                      <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                    </span>
                    {label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="h-[env(safe-area-inset-bottom)]" />
        </nav>
      </div>
    </div>
  );
}

function formatTodayBr() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const brDate = new Date(utc + 3600000 * -3); // UTC-3 (Brasília)
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(brDate);
}

function formatToday() {
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date());
}
