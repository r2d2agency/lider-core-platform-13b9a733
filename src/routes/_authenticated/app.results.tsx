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
    goals: Array<{ id: string; title: string; status: GoalStatus; measurable: string | null }>;
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
      <header className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Resultado
          </div>
          <h1 className="mt-1 font-display text-3xl">Gestão à vista</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Um único painel para ver, sem rodeios, onde está no verde, onde precisa de atenção e o
            que o ciclo atual promete entregar.
          </p>
        </div>
        <Link
          to="/app/indicators"
          className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium hover:bg-secondary md:inline-flex"
        >
          Gerenciar indicadores <ArrowRight className="h-3.5 w-3.5" />
        </Link>
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
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {data.activeCycle.goals.map((g, idx) => {
              const gm = GOAL_META[g.status];
              return (
                <li key={g.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="w-6 text-right font-display text-sm text-muted-foreground">
                    {idx + 1}
                  </span>
                  <span className={"inline-block h-2 w-2 rounded-full " + gm.dot} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{g.title}</div>
                    {g.measurable && (
                      <div className="truncate text-xs text-muted-foreground">
                        M · {g.measurable}
                      </div>
                    )}
                  </div>
                  <span className={"text-[10px] uppercase tracking-widest " + gm.tone}>
                    {gm.label}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
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
