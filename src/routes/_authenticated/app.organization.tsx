import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  BookOpen,
  Calendar,
  ClipboardList,
  FileText,
  Gauge,
  Handshake,
  IdCard,
  LayoutGrid,
  MessageSquareHeart,
  Network,
  ScrollText,
  Workflow,
} from "lucide-react";
import { useCurrentOrg } from "@/lib/use-current-org";

export const Route = createFileRoute("/_authenticated/app/organization")({
  component: OrganizationLayout,
});

type Tint = "orange" | "slate" | "violet" | "sky" | "emerald" | "rose";
type NavItem = { to: string; label: string; icon: typeof Gauge; tint: Tint; exact?: boolean };
const nav: NavItem[] = [
  { to: "/app/organization", label: "Painel", icon: Gauge, tint: "orange", exact: true },
  { to: "/app/organization/map", label: "Mapa da empresa", icon: Network, tint: "slate" },
  { to: "/app/organization/areas", label: "Áreas", icon: LayoutGrid, tint: "slate" },
  { to: "/app/organization/roles", label: "Cargos", icon: IdCard, tint: "slate" },
  { to: "/app/organization/rituals", label: "Rituais", icon: Workflow, tint: "violet" },
  { to: "/app/consciencia/agenda", label: "Agenda do líder", icon: Calendar, tint: "sky" },
  { to: "/app/organization/agenda", label: "Agenda organizacional", icon: Calendar, tint: "sky" },
  {
    to: "/app/organization/delegations",
    label: "Delegações",
    icon: ClipboardList,
    tint: "emerald",
  },
  { to: "/app/organization/agreements", label: "Acordos", icon: Handshake, tint: "rose" },
  { to: "/app/organization/decisions", label: "Decisões", icon: ScrollText, tint: "orange" },
  { to: "/app/organization/documents", label: "Base documental", icon: FileText, tint: "slate" },
  { to: "/app/pulses", label: "Pulso da equipe", icon: MessageSquareHeart, tint: "violet" },
];

// Páginas que, embora fisicamente aninhadas na rota /app/organization/*,
// pertencem visualmente a outro pilar (ex: Metas do time é Módulo R).
// Para essas, o layout não desenha o cabeçalho/grid de Organização —
// a própria página renderiza seu cabeçalho de pilar.
const FOREIGN_PILLAR_PATHS = new Set<string>(["/app/organization/cycles"]);

const TINT_MAP: Record<Tint, { bg: string; fg: string; ring: string }> = {
  orange: { bg: "bg-accent/10", fg: "text-accent", ring: "ring-accent/30" },
  slate: { bg: "bg-secondary", fg: "text-foreground", ring: "ring-border" },
  violet: {
    bg: "bg-violet-100 dark:bg-violet-500/15",
    fg: "text-violet-600 dark:text-violet-300",
    ring: "ring-violet-200 dark:ring-violet-500/25",
  },
  sky: {
    bg: "bg-sky-100 dark:bg-sky-500/15",
    fg: "text-sky-600 dark:text-sky-300",
    ring: "ring-sky-200 dark:ring-sky-500/25",
  },
  emerald: {
    bg: "bg-emerald-100 dark:bg-emerald-500/15",
    fg: "text-emerald-600 dark:text-emerald-300",
    ring: "ring-emerald-200 dark:ring-emerald-500/25",
  },
  rose: {
    bg: "bg-rose-100 dark:bg-rose-500/15",
    fg: "text-rose-600 dark:text-rose-300",
    ring: "ring-rose-200 dark:ring-rose-500/25",
  },
};

const PAGE_META: Record<string, { title: string; description: string }> = {
  "/app/organization": {
    title: "Ambiente do líder",
    description:
      "Estruture sua operação e crie o ambiente onde a liderança acontece todos os dias.",
  },
  "/app/organization/map": {
    title: "Mapa da empresa",
    description: "Organograma vivo: pessoas, áreas e cadeia de decisão.",
  },
  "/app/organization/areas": {
    title: "Áreas da empresa",
    description: "Estruture unidades, times e responsáveis.",
  },
  "/app/organization/roles": {
    title: "Cargos",
    description: "Papéis, atribuições e níveis de senioridade.",
  },
  "/app/organization/rituals": {
    title: "Rituais",
    description: "Cadência de rituais que sustentam a operação.",
  },
  "/app/organization/agenda": {
    title: "Agenda organizacional",
    description: "Visualize os compromissos, rituais e prioridades de toda a organização.",
  },
  "/app/organization/delegations": {
    title: "Delegações",
    description: "Combinados claros com prazos e responsáveis.",
  },
  "/app/organization/agreements": {
    title: "Acordos do time",
    description:
      "Comportamentos-padrão e entregas que o time não abre mão para cumprir os objetivos.",
  },
  "/app/pulses": {
    title: "Pulsos",
    description:
      "Envie um link único por WhatsApp e receba feedback, clima ou DISC direto do liderado — sem login.",
  },
  "/app/organization/decisions": {
    title: "Decisões",
    description: "Registro vivo das decisões e seus desdobramentos.",
  },
  "/app/organization/documents": {
    title: "Base documental",
    description: "Documentos, políticas e artefatos organizacionais.",
  },
};

function OrganizationLayout() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { current, orgs, setOrgId } = useCurrentOrg();
  const meta = PAGE_META[pathname] ?? PAGE_META["/app/organization"];
  const isHome = pathname === "/app/organization";
  const isForeignPillar = FOREIGN_PILLAR_PATHS.has(pathname);

  return (
    <div className="mx-auto max-w-6xl">
      {!isForeignPillar && (
        <>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Activity className="h-3.5 w-3.5" style={{ color: "var(--pilar-o)" }} /> Módulo
                Organização
              </span>
              <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
                {meta.title}
                {isHome && <span className="text-accent">.</span>}
              </h1>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">{meta.description}</p>
            </div>
            {isHome && <HeroCubes />}
            {orgs.length > 1 && current && (
              <select
                value={current.id}
                onChange={(e) => setOrgId(e.target.value)}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Grid de atalhos do módulo (ícones) */}
          <nav className="mb-6">
            <ul className="grid grid-cols-5 gap-2 sm:gap-3">
              {nav.map(({ to, label, icon: Icon, tint, exact }, idx) => {
                const active = exact ? pathname === to : pathname === to;
                const t = TINT_MAP[tint];
                return (
                  <li key={to + idx}>
                    <Link
                      to={to}
                      className={
                        "group flex h-full flex-col items-center justify-center gap-2 rounded-2xl border bg-card px-2 py-4 text-center transition-all " +
                        (active
                          ? "border-accent/50 shadow-[0_10px_30px_-18px] shadow-accent/60"
                          : "border-border hover:-translate-y-0.5 hover:border-accent/30 hover:shadow-sm")
                      }
                    >
                      <span
                        className={
                          "grid h-10 w-10 place-items-center rounded-xl ring-1 " +
                          t.bg +
                          " " +
                          t.fg +
                          " " +
                          t.ring
                        }
                      >
                        <Icon className="h-5 w-5" strokeWidth={1.75} />
                      </span>
                      <span
                        className={
                          "text-[11px] font-semibold leading-tight " +
                          (active ? "text-foreground" : "text-foreground/80")
                        }
                      >
                        {label}
                      </span>
                      {active && <span className="h-0.5 w-6 rounded-full bg-accent" />}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </>
      )}

      {!current ? <EmptyOrg /> : <Outlet />}
    </div>
  );
}

function HeroCubes() {
  // Ilustração decorativa de cubos isométricos flutuantes.
  return (
    <div aria-hidden className="pointer-events-none relative hidden h-40 w-56 shrink-0 md:block">
      <div className="absolute right-4 top-2 h-16 w-16 rotate-6 rounded-2xl border border-border bg-card shadow-lg" />
      <div className="absolute right-20 top-10 h-12 w-12 -rotate-6 rounded-xl border border-border bg-card shadow-md" />
      <div className="absolute right-8 bottom-3 h-20 w-20 rounded-2xl bg-primary shadow-2xl shadow-primary/25 flex items-center justify-center">
        <div className="h-3 w-3 rounded-full bg-background/80" />
      </div>
      <div className="absolute right-36 bottom-6 h-10 w-10 rotate-12 rounded-xl border border-accent/40 bg-accent/10" />
      <div className="absolute right-2 bottom-16 h-8 w-8 -rotate-12 rounded-lg border border-violet-300/60 bg-violet-100 dark:border-violet-500/40 dark:bg-violet-500/10" />
    </div>
  );
}

function EmptyOrg() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
      <p className="mt-3 text-sm text-muted-foreground">
        Você ainda não pertence a nenhuma organização. Peça a um administrador para incluir você em
        uma empresa.
      </p>
    </div>
  );
}
