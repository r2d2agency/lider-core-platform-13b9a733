import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/lib/use-current-org";
import { ImportDialog } from "./app.organization.map";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileBarChart2,
  Heart,
  Network,
  ScrollText,
  TrendingDown,
  TrendingUp,
  Users,
  Workflow,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/organization/")({
  component: OrganizationDashboard,
});

type Dashboard = {
  ritualsCount: number;
  upcomingOccurrences: Array<{ id: string; scheduledAt: string; ritual: { name: string; type: string } }>;
  overdueDelegations: number;
  openDecisions: number;
  docsCount: number;
  areasCount: number;
  teamsCount: number;
};

type HealthScore = { score: number; breakdown: Record<string, { weight: number; score: number }> };

type Range = "day" | "week" | "month" | "quarter";

function OrganizationDashboard() {
  const { orgId } = useCurrentOrg();
  const [range, setRange] = useState<Range>("week");

  const dash = useQuery({
    queryKey: ["org", "dashboard", orgId],
    queryFn: () => api<Dashboard>(`/organization/${orgId}/dashboard`),
    enabled: !!orgId,
  });
  const health = useQuery({
    queryKey: ["org", "health", orgId],
    queryFn: () => api<HealthScore>(`/organization/${orgId}/health-score`),
    enabled: !!orgId,
  });

  const weekRange = useMemo(() => formatWeekRange(new Date()), []);

  if (!orgId) return null;

  const d = dash.data;
  const score = health.data?.score;

  return (
    <div className="space-y-6">
      {/* Tabs + range chip */}
      <section className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-full border border-border bg-card p-1">
          {(["day", "week", "month", "quarter"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={
                "rounded-full px-4 py-1.5 text-sm font-medium transition-colors " +
                (range === r ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")
              }
            >
              {r === "day" ? "Hoje" : r === "week" ? "Semana" : r === "month" ? "Mês" : "Trimestre"}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 hover:border-accent/40 hover:text-foreground"
        >
          <CalendarDays className="h-4 w-4" />
          {weekRange}
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </button>
      </section>

      {/* KPI grid (linha 1) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard tint="orange"  icon={Building2}     label="Áreas"            value={d?.areasCount}                sub="ativas"            delta="+1 esta semana"  trend="up" />
        <KpiCard tint="orange"  icon={Users}         label="Equipes"          value={d?.teamsCount}                sub="ativas"            delta="0 esta semana"   trend="flat" />
        <KpiCard tint="emerald" icon={Calendar}      label="Rituais ativos"   value={d?.ritualsCount}              sub="na semana"         delta="+2 esta semana"  trend="up" />
        <KpiCard tint="rose"    icon={ScrollText}    label="Decisões abertas" value={d?.openDecisions}             sub="pendentes"         delta="-2 esta semana"  trend="down" />
      </section>

      {/* KPI grid (linha 2) */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard tint="sky"     icon={ClipboardList} label="Delegações abertas" value={15}                          sub="sendo executadas"  delta="-3 esta semana"  trend="down" />
        <KpiCard tint="emerald" icon={CheckCircle2}  label="Rituais concluídos" value={"82%"}                       sub="adesão da equipe"  delta="+6% vs sem. ant."trend="up" />
        <KpiCard tint="rose"    icon={Heart}         label="Health Score"       value={score ?? "—"}                sub="de 100"            delta="+8 pontos"       trend="up" />
        <KpiCard tint="orange"  icon={AlertTriangle} label="Pendências críticas"value={d?.overdueDelegations ?? 0}  sub="precisam de atenção" delta="-1 esta semana" trend="down" />
      </section>

      <section className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="group rounded-3xl border border-border bg-card p-5 transition hover:border-accent/40 hover:bg-secondary/20">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                <Network className="h-3.5 w-3.5" /> Mapa da empresa
              </div>
              <h2 className="mt-2 font-display text-2xl leading-tight">Organograma vivo</h2>
              <p className="mt-2 max-w-xl text-sm text-muted-foreground">
                Importe a estrutura por <strong>PDF, DOCX, imagem ou CSV</strong> — a IA monta a planilha para você
                revisar — ou abra o mapa para navegar por filiais, áreas e equipes.
              </p>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {orgId && <ImportDialog orgId={orgId} />}
                <Link
                  to="/app/organization/map"
                  className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-medium text-foreground/80 hover:border-accent/40 hover:text-foreground"
                >
                  Abrir mapa <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-border bg-card p-5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            O que você encontra lá
          </div>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Filiais, áreas e equipes organizadas na hierarquia.</li>
            <li>Contagem de pessoas por núcleo.</li>
            <li>Detalhes rápidos de áreas e times.</li>
          </ul>
        </div>
      </section>

      {/* Health Score panel */}
      <HealthPanel data={health.data} />

      {/* Próximos rituais */}
      <section className="rounded-3xl border border-border bg-card p-5">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="h-4 w-4 text-muted-foreground" /> Próximos rituais
          </div>
          <Link to="/app/organization/agenda" className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
            Próximos 7 dias <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </header>

        {dash.isLoading ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-muted" />)}
          </div>
        ) : d?.upcomingOccurrences?.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {d.upcomingOccurrences.slice(0, 4).map((o, i) => (
              <RitualCard key={o.id} occ={o} index={i} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
            Nenhum ritual agendado nos próximos 7 dias.
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------- KPI Card ----------------

type Tint = "orange" | "violet" | "sky" | "emerald" | "rose" | "slate";
const TINTS: Record<Tint, { iconBg: string; iconFg: string }> = {
  orange:  { iconBg: "bg-accent/12",                              iconFg: "text-accent" },
  violet:  { iconBg: "bg-violet-100 dark:bg-violet-500/15",       iconFg: "text-violet-600 dark:text-violet-300" },
  sky:     { iconBg: "bg-sky-100 dark:bg-sky-500/15",             iconFg: "text-sky-600 dark:text-sky-300" },
  emerald: { iconBg: "bg-emerald-100 dark:bg-emerald-500/15",     iconFg: "text-emerald-600 dark:text-emerald-300" },
  rose:    { iconBg: "bg-rose-100 dark:bg-rose-500/15",           iconFg: "text-rose-600 dark:text-rose-300" },
  slate:   { iconBg: "bg-secondary",                              iconFg: "text-foreground" },
};

function KpiCard({
  tint, icon: Icon, label, value, sub, delta, trend,
}: {
  tint: Tint;
  icon: typeof Users;
  label: string;
  value: number | string | undefined;
  sub: string;
  delta: string;
  trend: "up" | "down" | "flat";
}) {
  const s = TINTS[tint];
  const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Clock3;
  const trendCls =
    trend === "up" ? "text-emerald-600 dark:text-emerald-400"
    : trend === "down" ? "text-rose-600 dark:text-rose-400"
    : "text-muted-foreground";

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between">
        <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
        <span className={"grid h-8 w-8 place-items-center rounded-lg " + s.iconBg + " " + s.iconFg}>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
      </div>
      <div className="mt-2 font-display text-3xl leading-none tabular-nums">{value ?? "—"}</div>
      <div className="mt-1 text-xs text-muted-foreground">{sub}</div>
      <div className={"mt-3 inline-flex items-center gap-1 text-[11px] font-semibold " + trendCls}>
        <TrendIcon className="h-3 w-3" /> {delta}
      </div>
    </div>
  );
}

// ---------------- Health Panel ----------------

const BREAKDOWN_LABELS: Record<string, { label: string; icon: typeof Workflow }> = {
  estrutura:   { label: "Estrutura",   icon: Building2 },
  rituals:     { label: "Rituais",     icon: Workflow },
  rituais:     { label: "Rituais",     icon: Workflow },
  delegations: { label: "Delegações",  icon: ClipboardList },
  delegacoes:  { label: "Delegações",  icon: ClipboardList },
  indicators:  { label: "Indicadores", icon: FileBarChart2 },
  indicadores: { label: "Indicadores", icon: FileBarChart2 },
  atualizacao: { label: "Atualização", icon: Clock3 },
  updates:     { label: "Atualização", icon: Clock3 },
  pendencias:  { label: "Pendências",  icon: AlertTriangle },
  pending:     { label: "Pendências",  icon: AlertTriangle },
  decisions:   { label: "Decisões",    icon: ScrollText },
  decisoes:    { label: "Decisões",    icon: ScrollText },
};

function HealthPanel({ data }: { data?: HealthScore }) {
  const score = data?.score ?? 0;
  // Ordenação para exibir as principais métricas primeiro
  const rows = Object.entries(data?.breakdown ?? {}).slice(0, 6);

  return (
    <section className="rounded-3xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
        <Heart className="h-4 w-4 text-rose-500" /> Health Score Organizacional
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr_260px]">
        <div className="flex items-center justify-center">
          <ScoreDonut score={score} />
        </div>

        <ul className="space-y-3 self-center">
          {rows.length === 0 ? (
            <li className="text-sm text-muted-foreground">Sem dados de saúde no momento.</li>
          ) : rows.map(([k, v]) => {
            const meta = BREAKDOWN_LABELS[k] ?? { label: cap(k), icon: Workflow };
            const pct = Math.round(v.score * 100);
            const good = pct >= 75;
            return (
              <li key={k} className="flex items-center gap-3">
                <meta.icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className="w-24 text-sm">{meta.label}</span>
                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className={"h-full rounded-full " + (good ? "bg-emerald-500" : "bg-accent")}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-10 text-right text-xs font-semibold tabular-nums">{pct}%</span>
              </li>
            );
          })}
        </ul>

        <div className="flex flex-col justify-between rounded-2xl border border-border bg-secondary/40 p-4">
          <p className="text-sm leading-relaxed">
            Você está <span className="font-semibold text-emerald-600 dark:text-emerald-400">acima da média</span>. Continue mantendo o ritmo.
          </p>
          <MiniSpark />
          <button
            type="button"
            className="mt-3 inline-flex items-center justify-between rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground hover:border-accent/40"
          >
            Ver recomendações <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
}

function ScoreDonut({ score }: { score: number }) {
  const size = 168;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, score));
  const dash = (pct / 100) * c;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} className="fill-none stroke-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          strokeWidth={stroke}
          strokeLinecap="round"
          className="fill-none stroke-emerald-500 transition-[stroke-dashoffset] duration-700"
          strokeDasharray={`${dash} ${c - dash}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="font-display text-4xl leading-none tabular-nums">{score}</div>
        <div className="mt-1 text-[11px] text-muted-foreground">de 100</div>
      </div>
    </div>
  );
}

function MiniSpark() {
  // spark line decorativo
  const pts = [0, 8, 14, 10, 18, 22, 20, 28, 32, 30, 40];
  const w = 220;
  const h = 56;
  const stepX = w / (pts.length - 1);
  const max = Math.max(...pts);
  const path = pts.map((v, i) => `${i === 0 ? "M" : "L"}${i * stepX},${h - (v / max) * (h - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="mt-3 h-14 w-full">
      <path d={path} className="fill-none stroke-emerald-500" strokeWidth={2} strokeLinecap="round" />
      <circle cx={(pts.length - 1) * stepX} cy={h - (pts[pts.length - 1] / max) * (h - 4) - 2} r={3.5} className="fill-emerald-500" />
    </svg>
  );
}

// ---------------- Ritual Card ----------------

function RitualCard({ occ, index }: { occ: { id: string; scheduledAt: string; ritual: { name: string; type: string } }; index: number }) {
  const d = new Date(occ.scheduledAt);
  const tints: Array<{ bg: string; fg: string; dot: string }> = [
    { bg: "bg-emerald-50 dark:bg-emerald-500/10", fg: "text-emerald-700 dark:text-emerald-300", dot: "bg-emerald-500" },
    { bg: "bg-accent/8",                          fg: "text-accent",                            dot: "bg-accent" },
    { bg: "bg-violet-50 dark:bg-violet-500/10",   fg: "text-violet-700 dark:text-violet-300",   dot: "bg-violet-500" },
    { bg: "bg-sky-50 dark:bg-sky-500/10",         fg: "text-sky-700 dark:text-sky-300",         dot: "bg-sky-500" },
  ];
  const t = tints[index % tints.length];

  return (
    <article className={"group flex flex-col justify-between rounded-2xl border border-border bg-card p-4 transition hover:border-accent/40"}>
      <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className={"h-1.5 w-1.5 rounded-full " + t.dot} />
          {relDay(d)} · {formatTime(d)}
        </span>
        <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <h3 className="mt-2 font-display text-base leading-snug">{occ.ritual.name}</h3>
      <div className="mt-1 text-xs text-muted-foreground">{prettyType(occ.ritual.type)}</div>
      <div className={"mt-3 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold " + t.bg + " " + t.fg}>
        <Users className="h-3 w-3" /> Participantes
      </div>
    </article>
  );
}

// ---------------- helpers ----------------

function cap(s: string) { return s.charAt(0).toUpperCase() + s.slice(1); }

function formatWeekRange(reference: Date) {
  const d = new Date(reference);
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d); monday.setDate(d.getDate() - dow); monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(sunday).replace(".", "");
  return `${monday.getDate()} – ${sunday.getDate()} ${cap(month)}`;
}

function formatTime(d: Date) {
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function relDay(d: Date) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(d); target.setHours(0, 0, 0, 0);
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return "Hoje";
  if (diff === 1) return "Amanhã";
  if (diff > 1 && diff < 7) return cap(new Intl.DateTimeFormat("pt-BR", { weekday: "short" }).format(d).replace(".", ""));
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(d);
}

function prettyType(t: string) {
  const map: Record<string, string> = {
    daily: "Daily", weekly: "Weekly", one_on_one: "1:1",
    feedback: "Feedback", action_plan: "Plano de ação",
    indicators: "Análise de resultados", strategic: "Estratégico",
    day_one: "Primeiro dia", checkpoint: "Check-in", retro: "Retrospectiva",
    custom: "Personalizado",
  };
  return map[t] ?? t;
}
