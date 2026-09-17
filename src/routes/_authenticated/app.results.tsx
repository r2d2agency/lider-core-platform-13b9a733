import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  Compass,
  Loader2,
  Scale,
  Target,
  TrendingDown,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/lib/use-current-org";

export const Route = createFileRoute("/_authenticated/app/results")({
  component: ResultsPage,
  head: () => ({
    meta: [
      { title: "Gestão à vista — LíderCore" },
      { name: "description", content: "Semáforos por área e ranking de metas do ciclo ativo." },
    ],
  }),
});

type IndicatorStatus = "on_target" | "warning" | "off_target" | "unknown";
type GoalStatus = "on_track" | "at_risk" | "off_track" | "done" | "dropped";

type IndicatorRow = {
  id: string;
  name: string;
  unit: string | null;
  direction: "higher_better" | "lower_better";
  target: number | null;
  status: IndicatorStatus;
  lastReading: { value: number; periodMonth: number; periodYear: number } | null;
  delta: number | null;
};

type AreaBlock = {
  id: string | null;
  name: string;
  indicators: IndicatorRow[];
  counts: Record<IndicatorStatus, number>;
  health: number | null;
};

type Overview = {
  totals: Record<IndicatorStatus, number>;
  areas: AreaBlock[];
  activeCycle: {
    id: string;
    name: string;
    startAt: string;
    endAt: string;
    goals: Array<{
      id: string;
      title: string;
      status: GoalStatus;
      measurable: string | null;
      targetValue: number | null;
      currentValue: number | null;
      dueAt: string | null;
      indicatorId: string | null;
      ownerUserId: string | null;
      actionItems: Array<{
        id: string;
        title: string;
        status: "pending" | "in_progress" | "done";
        dueAt: string | null;
      }>;
      breakdowns: Array<{
        id: string;
        memberLabel: string | null;
        title: string;
        targetValue: number | null;
        currentValue: number | null;
        status: GoalStatus;
      }>;
      teamReadiness: Array<{ id: string; actions: string[]; monthlyPlan: string | null }>;
      cultureChecks: Array<{
        id: string;
        practicesCulture: number | null;
        highPerformanceOrientation: number | null;
        factBasedDecisions: number | null;
        intellectualHonesty: number | null;
        behaviorsAlignment: number | null;
      }>;
    }>;
  } | null;
};

type DeviationClass = "on_target" | "execucao" | "recuperando" | "calibracao";
type MetaVsReal = {
  summary: Record<DeviationClass, number>;
  rows: Array<{
    id: string;
    name: string;
    unit: string | null;
    area: { id: string; name: string } | null;
    target: number;
    direction: "higher_better" | "lower_better";
    lastValue: number;
    lastPeriod: { year: number; month: number };
    gapPct: number;
    status: "on_target" | "warning" | "off_target";
    classification: DeviationClass;
    diagnostic: string;
    history: number[];
  }>;
};

const DEV_META: Record<
  DeviationClass,
  { label: string; tone: string; dot: string; icon: typeof Wrench }
> = {
  on_target: {
    label: "No verde",
    tone: "text-emerald-600",
    dot: "bg-emerald-500",
    icon: CheckCircle2,
  },
  recuperando: { label: "Recuperando", tone: "text-sky-600", dot: "bg-sky-500", icon: Compass },
  execucao: { label: "Execução", tone: "text-rose-600", dot: "bg-rose-500", icon: Wrench },
  calibracao: { label: "Calibração", tone: "text-amber-600", dot: "bg-amber-500", icon: Scale },
};

const STATUS_DOT: Record<IndicatorStatus, string> = {
  on_target: "bg-emerald-500",
  warning: "bg-amber-500",
  off_target: "bg-rose-500",
  unknown: "bg-muted-foreground/40",
};
const STATUS_LABEL: Record<IndicatorStatus, string> = {
  on_target: "Dentro da meta",
  warning: "Perto do limite",
  off_target: "Fora da meta",
  unknown: "Sem leitura",
};
const GOAL_META: Record<GoalStatus, { label: string; dot: string; tone: string }> = {
  off_track: { label: "Atrasada", dot: "bg-rose-500", tone: "text-rose-600" },
  at_risk: { label: "Em risco", dot: "bg-amber-500", tone: "text-amber-600" },
  on_track: { label: "No prumo", dot: "bg-emerald-500", tone: "text-emerald-600" },
  done: { label: "Concluída", dot: "bg-sky-500", tone: "text-sky-600" },
  dropped: { label: "Descartada", dot: "bg-muted-foreground", tone: "text-muted-foreground" },
};

function ResultsPage() {
  const { orgId } = useCurrentOrg();
  const q = useQuery({
    queryKey: ["results-overview", orgId],
    enabled: !!orgId,
    queryFn: () => api<Overview>(`/organization/${orgId}/results-overview`),
    staleTime: 60_000,
  });
  const mvr = useQuery({
    queryKey: ["results-mvr", orgId],
    enabled: !!orgId,
    queryFn: () => api<MetaVsReal>(`/organization/${orgId}/results/meta-vs-real`),
    staleTime: 60_000,
  });

  if (!orgId) return null;
  if (q.isLoading) {
    return (
      <div className="grid place-items-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const data = q.data;
  if (!data) return null;

  const total =
    data.totals.on_target + data.totals.warning + data.totals.off_target + data.totals.unknown;

  return (
    <div className="space-y-8">
      <header className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-7">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-600">
              Módulo Resultado · Alcançar metas
            </div>
            <h1 className="mt-2 font-display text-3xl md:text-4xl">Gestão à vista</h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Comece pelo que o time precisa entregar e acompanhe os sinais que antecipam o
              resultado — antes do fim do ciclo.
            </p>
          </div>
          <Link
            to="/app/indicators"
            className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary md:inline-flex"
          >
            Gerenciar indicadores <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        <ol className="mt-6 grid grid-cols-2 gap-2 border-t border-border pt-5 sm:grid-cols-3 lg:grid-cols-6">
          {[
            "Meta do time",
            "Indicadores",
            "Lacuna",
            "Responsável",
            "Plano de ação",
            "Acompanhamento",
          ].map((step, index) => (
            <li key={step} className="flex items-center gap-2 text-xs font-medium">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-rose-500/10 text-[10px] font-bold text-rose-600">
                {index + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </header>

      <section className="grid gap-3 md:grid-cols-4">
        <StatTile label="Indicadores" value={total} icon={<Target className="h-4 w-4" />} />
        <StatTile
          label="Dentro da meta"
          value={data.totals.on_target}
          tone="text-emerald-600"
          dot="bg-emerald-500"
        />
        <StatTile
          label="Perto do limite"
          value={data.totals.warning}
          tone="text-amber-600"
          dot="bg-amber-500"
        />
        <StatTile
          label="Fora da meta"
          value={data.totals.off_target}
          tone="text-rose-600"
          dot="bg-rose-500"
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-accent" />
          <h2 className="font-display text-xl">Semáforo por área</h2>
        </div>
        {data.areas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Cadastre indicadores em{" "}
            <Link to="/app/indicators" className="text-accent hover:underline">
              Indicadores
            </Link>{" "}
            para ver o painel.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {data.areas.map((a) => (
              <AreaCard key={a.id ?? "none"} area={a} />
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Diagnóstico
            </div>
            <h2 className="mt-1 flex items-center gap-2 font-display text-xl">
              <Scale className="h-4 w-4 text-accent" /> Meta × Realizado
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Cada desvio tem origem: ou a execução falhou, ou a meta foi mal calibrada. O sistema
              separa os dois para você agir no lugar certo.
            </p>
          </div>
        </div>

        {mvr.isLoading ? (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            Analisando…
          </div>
        ) : !mvr.data || mvr.data.rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Sem indicadores com meta e leituras suficientes ainda.
          </div>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              {(Object.keys(DEV_META) as DeviationClass[]).map((k) => {
                const m = DEV_META[k];
                const Icon = m.icon;
                return (
                  <div key={k} className="rounded-2xl border border-border bg-card p-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                      <span className={"inline-block h-2 w-2 rounded-full " + m.dot} />
                      <Icon className="h-3.5 w-3.5" />
                      {m.label}
                    </div>
                    <div className={"mt-2 font-display text-3xl " + m.tone}>
                      {mvr.data!.summary[k] ?? 0}
                    </div>
                  </div>
                );
              })}
            </div>

            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {mvr.data.rows
                .slice()
                .sort((a, b) => {
                  const order: Record<DeviationClass, number> = {
                    execucao: 0,
                    calibracao: 1,
                    recuperando: 2,
                    on_target: 3,
                  };
                  return order[a.classification] - order[b.classification];
                })
                .slice(0, 12)
                .map((r) => {
                  const m = DEV_META[r.classification];
                  const Icon = m.icon;
                  return (
                    <li
                      key={r.id}
                      className="grid gap-2 px-4 py-3 md:grid-cols-[1fr_auto_auto_auto] md:items-center md:gap-4"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={"inline-block h-2 w-2 rounded-full " + m.dot} />
                          <span className="truncate text-sm font-medium">{r.name}</span>
                          {r.area && (
                            <span className="hidden shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-widest text-muted-foreground md:inline">
                              {r.area.name}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">{r.diagnostic}</div>
                      </div>
                      <div className="hidden text-right tabular-nums text-sm md:block">
                        <div>
                          {r.lastValue}
                          {r.unit ?? ""}{" "}
                          <span className="text-muted-foreground">
                            / meta {r.target}
                            {r.unit ?? ""}
                          </span>
                        </div>
                        <div
                          className={
                            "text-[11px] " +
                            (r.status === "on_target"
                              ? "text-emerald-600"
                              : r.status === "warning"
                                ? "text-amber-600"
                                : "text-rose-600")
                          }
                        >
                          {r.gapPct > 0 ? "+" : ""}
                          {r.gapPct}%
                        </div>
                      </div>
                      <span
                        className={
                          "inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] uppercase tracking-widest " +
                          m.tone
                        }
                      >
                        <Icon className="h-3 w-3" /> {m.label}
                      </span>
                      <Link
                        to="/app/indicators"
                        className="hidden items-center gap-1 text-[11px] text-accent hover:underline md:inline-flex"
                      >
                        Abrir PDCA <ArrowRight className="h-3 w-3" />
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-accent" />
          <h2 className="font-display text-xl">Ciclo ativo</h2>
          {data.activeCycle && (
            <span className="text-xs text-muted-foreground">
              {data.activeCycle.name} ·{" "}
              {new Date(data.activeCycle.startAt).toLocaleDateString("pt-BR")}—
              {new Date(data.activeCycle.endAt).toLocaleDateString("pt-BR")}
            </span>
          )}
        </div>
        {!data.activeCycle ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Nenhum ciclo ativo. Abra um em{" "}
            <Link to="/app/organization/cycles" className="text-accent hover:underline">
              Metas do time
            </Link>
            .
          </div>
        ) : data.activeCycle.goals.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Ciclo aberto sem metas SMART.{" "}
            <Link to="/app/organization/cycles" className="text-accent hover:underline">
              Adicionar meta
            </Link>
            .
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
              {data.activeCycle.goals.map((g, idx) => {
                const gm = GOAL_META[g.status];
                const progress = goalProgress(g.currentValue, g.targetValue);
                const pendingActions = g.actionItems.filter((item) => item.status !== "done");
                return (
                  <li key={g.id} className="px-4 py-4">
                    <div className="flex items-start gap-3">
                      <span className="w-6 text-right font-display text-sm text-muted-foreground">
                        {idx + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={"inline-block h-2 w-2 rounded-full " + gm.dot} />
                          <h3 className="text-sm font-semibold">{g.title}</h3>
                          <span className={"text-[10px] uppercase tracking-widest " + gm.tone}>
                            {gm.label}
                          </span>
                        </div>
                        {g.measurable && (
                          <p className="mt-1 text-xs text-muted-foreground">{g.measurable}</p>
                        )}
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-rose-500 transition-[width]"
                            style={{ width: `${progress}%` }}
                            role="progressbar"
                            aria-label={`Progresso de ${g.title}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progress}
                          />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                          <span className="tabular-nums">{progress}% realizado</span>
                          <span>
                            {g.indicatorId ? "Indicador vinculado" : "Sem indicador vinculado"}
                          </span>
                          <span>
                            <Users className="mr-1 inline h-3 w-3" />
                            {g.breakdowns.length} desdobramento(s)
                          </span>
                          <span>{pendingActions.length} ação(ões) aberta(s)</span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <aside className="rounded-2xl border border-rose-500/20 bg-rose-500/[0.04] p-4">
              <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-600">
                Agenda de ação do líder
              </div>
              <h3 className="mt-1 font-display text-lg">O que exige atuação agora</h3>
              <ol className="mt-4 space-y-3">
                {buildLeaderAgenda(data.activeCycle.goals).length === 0 ? (
                  <li className="text-sm text-muted-foreground">
                    Nenhum alerta crítico no ciclo. Continue acompanhando os indicadores.
                  </li>
                ) : (
                  buildLeaderAgenda(data.activeCycle.goals).map((item, index) => (
                    <li key={item} className="flex gap-3 text-sm leading-snug">
                      <span className="font-display text-rose-600">{index + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))
                )}
              </ol>
              <Link
                to="/app/organization/cycles"
                className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-rose-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                Abrir gestão das metas <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </aside>
          </div>
        )}
      </section>
    </div>
  );
}

function goalProgress(current: number | null, target: number | null) {
  if (current == null || target == null || target === 0) return 0;
  return Math.max(0, Math.min(100, Math.round((current / target) * 100)));
}

function buildLeaderAgenda(goals: NonNullable<Overview["activeCycle"]>["goals"]) {
  const items: string[] = [];
  for (const goal of goals) {
    if (items.length >= 5) break;
    const progress = goalProgress(goal.currentValue, goal.targetValue);
    const openActions = goal.actionItems.filter((item) => item.status !== "done");
    const latestCulture = goal.cultureChecks[0];
    const cultureScores = latestCulture
      ? [
          latestCulture.practicesCulture,
          latestCulture.highPerformanceOrientation,
          latestCulture.factBasedDecisions,
          latestCulture.intellectualHonesty,
          latestCulture.behaviorsAlignment,
        ].filter((score): score is number => score != null)
      : [];
    const cultureAverage = cultureScores.length
      ? cultureScores.reduce((sum, score) => sum + score, 0) / cultureScores.length
      : null;

    if (goal.status === "off_track" || goal.status === "at_risk") {
      items.push(
        `${goal.title}: ${progress}% realizado e ${GOAL_META[goal.status].label.toLowerCase()}.`,
      );
    } else if (!goal.indicatorId) {
      items.push(`${goal.title}: vincule um indicador para antecipar desvios.`);
    } else if (openActions.length > 0) {
      items.push(
        `${goal.title}: ${openActions.length} ação(ões) ainda precisam de acompanhamento.`,
      );
    } else if (goal.breakdowns.length === 0) {
      items.push(`${goal.title}: desdobre a meta entre os responsáveis do time.`);
    } else if (goal.teamReadiness.length === 0) {
      items.push(`${goal.title}: registre se o time domina o método e tem preparo técnico.`);
    } else if (cultureAverage != null && cultureAverage < 3) {
      items.push(`${goal.title}: o radar de cultura indica um ponto de atenção.`);
    }
  }
  return items.slice(0, 5);
}

function StatTile({
  label,
  value,
  tone,
  dot,
  icon,
}: {
  label: string;
  value: number;
  tone?: string;
  dot?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
        {dot && <span className={"inline-block h-2 w-2 rounded-full " + dot} />}
        {icon}
        {label}
      </div>
      <div className={"mt-2 font-display text-3xl " + (tone ?? "text-foreground")}>{value}</div>
    </div>
  );
}

function AreaCard({ area }: { area: AreaBlock }) {
  const total =
    area.counts.on_target + area.counts.warning + area.counts.off_target + area.counts.unknown;
  const healthTone =
    area.health == null
      ? "text-muted-foreground"
      : area.health >= 80
        ? "text-emerald-600"
        : area.health >= 60
          ? "text-amber-600"
          : "text-rose-600";

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Área</div>
          <h3 className="mt-1 truncate font-display text-lg">{area.name}</h3>
        </div>
        <div className="text-right">
          <div className={"font-display text-2xl " + healthTone}>{area.health ?? "—"}</div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">saúde</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
        <StatusChip dot="bg-emerald-500" label={`${area.counts.on_target} no verde`} />
        <StatusChip dot="bg-amber-500" label={`${area.counts.warning} atenção`} />
        <StatusChip dot="bg-rose-500" label={`${area.counts.off_target} fora`} />
        {area.counts.unknown > 0 && (
          <StatusChip dot="bg-muted-foreground/50" label={`${area.counts.unknown} s/ leitura`} />
        )}
        <span className="ml-auto text-muted-foreground">{total} ind.</span>
      </div>

      <ul className="mt-4 space-y-1.5">
        {area.indicators.slice(0, 6).map((i) => {
          const DeltaIcon = (i.delta ?? 0) >= 0 ? TrendingUp : TrendingDown;
          const deltaTone =
            i.delta == null
              ? "text-muted-foreground"
              : (i.direction === "higher_better" ? i.delta >= 0 : i.delta <= 0)
                ? "text-emerald-600"
                : "text-rose-600";
          return (
            <li
              key={i.id}
              className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-secondary/60"
            >
              <span
                className={"inline-block h-2 w-2 shrink-0 rounded-full " + STATUS_DOT[i.status]}
                title={STATUS_LABEL[i.status]}
              />
              <span className="min-w-0 flex-1 truncate text-sm">{i.name}</span>
              <span className="tabular-nums text-sm text-foreground/80">
                {i.lastReading ? `${i.lastReading.value}${i.unit ?? ""}` : "—"}
              </span>
              {i.target != null && (
                <span className="hidden text-[10px] text-muted-foreground sm:inline">
                  meta {i.target}
                  {i.unit ?? ""}
                </span>
              )}
              {i.delta != null && i.delta !== 0 && (
                <span className={"flex items-center gap-0.5 text-[11px] " + deltaTone}>
                  <DeltaIcon className="h-3 w-3" />
                  {i.delta > 0 ? "+" : ""}
                  {Math.round(i.delta * 100) / 100}
                </span>
              )}
            </li>
          );
        })}
        {area.indicators.length > 6 && (
          <li className="px-2 pt-1 text-[11px] text-muted-foreground">
            +{area.indicators.length - 6} outros indicadores
          </li>
        )}
        {area.indicators.length === 0 && (
          <li className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5" /> Nenhum indicador nesta área.
          </li>
        )}
      </ul>
    </div>
  );
}

function StatusChip({ dot, label }: { dot: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
      <span className={"inline-block h-1.5 w-1.5 rounded-full " + dot} />
      {label}
    </span>
  );
}
