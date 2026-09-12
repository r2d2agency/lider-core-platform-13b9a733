import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Logo } from "@/components/brand/Logo";
import { GlobalSearch } from "@/components/admin/GlobalSearch";
import { useEffect, useState } from "react";
import {
  LogOut,
  LayoutDashboard,
  Building2,
  Store,
  Users,
  CreditCard,
  Receipt,
  Brain,
  Palette,
  BookOpen,
  Package,
  ArrowLeftRight,
  Network,
  KeyRound,
  ShieldCheck,
  ClipboardCheck,
  FileText,
  Boxes,
  Search,
  Settings2,
  Bell,
  Database,
  HelpCircle,
  ToggleRight,
  Library,
  Route as RouteIcon,
  GitBranch,
  History,
  Rocket,
  type LucideIcon,
} from "lucide-react";

type NavItem = { to: string; label: string; icon: LucideIcon };
type NavSection = { title: string; items: NavItem[] };

const navSections: NavSection[] = [
  {
    title: "Visão",
    items: [{ to: "/admin", label: "Briefing", icon: LayoutDashboard }],
  },
  {
    title: "Neo — Inteligência",
    items: [
      { to: "/admin/neo/methodology", label: "Metodologia", icon: BookOpen },
      { to: "/admin/neo/knowledge", label: "Base de Conhecimento", icon: Library },
      { to: "/admin/neo/assessments", label: "Assessments", icon: ClipboardCheck },
      { to: "/admin/neo/journeys", label: "Jornadas", icon: RouteIcon },
      { to: "/admin/neo/templates", label: "Templates", icon: FileText },
    ],
  },
  {
    title: "Clientes",
    items: [
      { to: "/admin/franchises", label: "Franquias", icon: Store },
      { to: "/admin/organizations", label: "Empresas", icon: Building2 },
      { to: "/admin/hierarchy", label: "Filiais / Áreas / Equipes", icon: Network },
      { to: "/admin/users", label: "Usuários", icon: Users },
      { to: "/admin/permissions", label: "Permissões (RBAC)", icon: ShieldCheck },
      { to: "/admin/plans", label: "Planos", icon: Package },
      { to: "/admin/licenses", label: "Licenças", icon: KeyRound },
      { to: "/admin/subscriptions", label: "Assinaturas", icon: CreditCard },
      { to: "/admin/invoices", label: "Faturas", icon: Receipt },
      { to: "/admin/billing", label: "Cobrança (Asaas)", icon: CreditCard },
    ],
  },
  {
    title: "Sistema",
    items: [
      { to: "/admin/ai", label: "Provedor IA", icon: Brain },
      { to: "/admin/branding", label: "Branding", icon: Palette },
      { to: "/admin/modules", label: "Módulos do produto", icon: Boxes },
      { to: "/admin/feature-templates", label: "Templates de módulos", icon: ToggleRight },
      { to: "/admin/signup-plans", label: "Planos de cadastro", icon: ToggleRight },
      { to: "/admin/invites", label: "Convites de líder", icon: KeyRound },
      { to: "/admin/apps", label: "Apps & Versões", icon: Package },
      { to: "/admin/notifications", label: "Notificações", icon: Bell },
      { to: "/admin/data", label: "Dados (Import/Export)", icon: Database },
      { to: "/admin/onboarding", label: "Onboarding", icon: ClipboardCheck },
      { to: "/admin/settings", label: "Configurações", icon: Settings2 },
    ],
  },
  {
    title: "Auditoria",
    items: [
      { to: "/admin/neo/audit", label: "Trilha de mudanças", icon: History },
      { to: "/admin/logs", label: "Logs do sistema", icon: FileText },
      { to: "/admin/methodology", label: "Metodologia (legado)", icon: GitBranch },
      { to: "/admin/help", label: "Documentação", icon: HelpCircle },
      { to: "/admin/roadmap", label: "Changelog & Roadmap", icon: Rocket },
    ],
  },
];

export function AdminShell() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen((s) => !s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const handleSignOut = async () => {
    await queryClient.cancelQueries();
    queryClient.clear();
    signOut();
    toast.success("Até logo.");
    navigate({ to: "/auth", search: {}, replace: true } as any);
  };

  return (
    <div className="neo-admin min-h-screen">
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
      <div className="flex min-h-screen">
        <aside
          className="hidden w-72 shrink-0 flex-col border-r neo-hairline md:flex"
          style={{ background: "var(--neo-cream)" }}
        >
          <div className="flex items-center gap-3 border-b neo-hairline px-6 py-5">
            <Logo className="h-6 w-auto max-w-[130px]" />
            <span className="neo-eyebrow">Neo · Admin</span>
          </div>
          <button
            onClick={() => setSearchOpen(true)}
            className="mx-4 mt-4 flex items-center gap-2 rounded-full border neo-hairline bg-white/60 px-4 py-2 text-xs text-[color:var(--neo-muted)] transition-colors hover:bg-white"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.4} />
            <span className="flex-1 text-left">Buscar em tudo</span>
            <kbd className="rounded border neo-hairline bg-white px-1.5 py-0.5 text-[10px]">⌘K</kbd>
          </button>
          <nav className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
            {navSections.map((section) => (
              <div key={section.title} className="space-y-1">
                <div className="neo-eyebrow px-2 pb-2">{section.title}</div>
                {section.items.map((item) => {
                  const active =
                    item.to === "/admin"
                      ? pathname === "/admin" || pathname === "/admin/"
                      : pathname.startsWith(item.to);
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      className={`group flex items-center gap-3 rounded-lg px-3 py-2 text-[13px] transition-colors ${
                        active
                          ? "bg-white text-[color:var(--neo-ink)] shadow-[0_1px_0_rgba(0,0,0,0.02)]"
                          : "text-[color:var(--neo-muted)] hover:bg-white/60 hover:text-[color:var(--neo-ink)]"
                      }`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${active ? "text-[color:var(--neo-accent)]" : ""}`}
                        strokeWidth={1.4}
                      />
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="border-t neo-hairline p-4">
            <div className="mb-2 truncate px-2 text-xs text-[color:var(--neo-muted)]">
              {user?.email}
            </div>
            <div className="grid gap-1">
              <Link
                to="/app"
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[color:var(--neo-muted)] hover:bg-white hover:text-[color:var(--neo-ink)]"
              >
                <ArrowLeftRight className="h-3.5 w-3.5" />
                Ver como líder
              </Link>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-[color:var(--neo-muted)] hover:bg-white hover:text-[color:var(--neo-ink)]"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sair
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 overflow-x-hidden">
          <header className="flex items-center justify-between border-b neo-hairline bg-white/70 px-6 py-3 backdrop-blur md:hidden">
            <Logo className="h-6 w-auto max-w-[120px]" />
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-2 rounded-full border neo-hairline px-3 py-1.5 text-xs text-[color:var(--neo-muted)]"
            >
              <LogOut className="h-3.5 w-3.5" /> Sair
            </button>
          </header>
          <div className="mx-auto max-w-6xl px-6 py-10 md:px-12 md:py-14">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

export function AdminPageHeader({
  title,
  eyebrow,
  description,
  action,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4 border-b neo-hairline pb-6">
      <div>
        <div className="neo-eyebrow">{eyebrow ?? "Painel Neo"}</div>
        <h1 className="mt-2 text-4xl md:text-5xl">{title}</h1>
        {description && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-[color:var(--neo-muted)]">
            {description}
          </p>
        )}
      </div>
      {action}
    </div>
  );
}
