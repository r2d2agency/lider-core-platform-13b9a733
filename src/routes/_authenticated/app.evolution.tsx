import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2,
  Save,
  Sparkles,
  TrendingUp,
  CheckSquare,
  Target,
  MessageSquare,
  Building2,
  Users2,
  Heart,
  ClipboardList,
  ListChecks,
  ChevronRight,
  AlertTriangle,
  Activity,
} from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/lib/use-current-org";
import { Button } from "@/components/ui/button";
import { CompositionBars, ScoreGauge, TrendArea } from "@/components/charts";
import { CountUp, FadeIn, StaggerItem, StaggerList } from "@/components/motion";
import { SectionHeader } from "@/components/ui/metric-card";

export const Route = createFileRoute("/_authenticated/app/evolution")({
  component: EvolutionPage,
});

type Snapshot = {
  id: string;
  periodYear: number;
  periodMonth: number;
  score: number;
  ritualsScore: number;
  delegScore: number;
  indicatorsScore: number;
  diagnostic: string | null;
};

type MeResponse = {
  current: {
    score: number;
    diagnostic: string;
    breakdown: {
      ritualsScore: number;
      delegScore: number;
      indicatorsScore: number;
      rituals: { done: number; planned: number };
      delegations: { onTime: number; total: number; overdue: number };
      indicators: { onTarget: number; withReadings: number };
    };
    hard: Dimension;
    soft: Dimension;
    heart: Dimension;
  };
  trend: Snapshot[];
  commitments: Array<{ id: string; phrase: string; status: string }>;
};

type Dimension = {
  score: number;
  parts: Array<{ label: string; value: number; hint?: string }>;
  diagnostic: string;
};

type TimelineEvent = {
  id: string;
  kind: "snapshot" | "delegation" | "pdi" | "feedback";
  at: string;
  title: string;
  detail?: string | null;
  score?: number;
};

// ---------- Painel executivo (item 5 do PDF de reorganização) ----------

type TodayItem = {
  id: string;
  type:
    | "delegation_overdue"
    | "delegation_due_soon"
    | "ritual_today"
    | "one_on_one"
    | "signal"
    | "team_drop";
  priority: 1 | 2 | 3;
  title: string;
  subtitle: string;
  cta: string;
  href: string;
};
type TodayResp = {
  items: TodayItem[];
  counts: { overdue: number; dueSoon: number; rituals: number; oneOnOnes: number; signals: number };
};
type TeamHealthResp = {
  score: number | null;
  delta: number;
  membersAtRisk: number;
  members: unknown[];
};
type OverviewGoal = {
  id: string;
  title: string;
  status: "on_track" | "at_risk" | "off_track" | "done" | "dropped";
  targetValue: number | null;
  currentValue: number | null;
  dueAt: string | null;
};
type ResultsOverview = {
  totals: { on_target: number; warning: number; off_target: number; unknown: number };
  activeCycle: {
    id: string;
    name: string;
    startAt: string;
    endAt: string;
    goals: OverviewGoal[];
  } | null;
};
type PendingAction = {
  id: string;
  title: string;
  dueAt: string | null;
  status: "pending" | "in_progress" | "done";
  goal: { id: string; title: string; dueAt: string | null };
};

const GOAL_DOT: Record<OverviewGoal["status"], string> = {
  on_track: "bg-emerald-500",
  at_risk: "bg-amber-500",
  off_track: "bg-rose-500",
  done: "bg-sky-500",
  dropped: "bg-muted-foreground",
};

function projectGoal(g: OverviewGoal, cycle: { startAt: string; endAt: string }) {
  if (g.targetValue == null || g.currentValue == null) return null;
  const start = new Date(cycle.startAt).getTime();
  const end = new Date(g.dueAt ?? cycle.endAt).getTime();
  const now = Date.now();
  const elapsed = now - start;
  const total = end - start;
  if (elapsed <= 0 || total <= 0) return null;
  const projected = (g.currentValue / elapsed) * total;
  return Math.round(projected);
}

function CockpitCard({
  icon,
  title,
  to,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  to?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card-elevated flex flex-col p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          {icon} {title}
        </div>
        {to && (
          <Link
            to={to}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-accent hover:underline"
          >
            Ver tudo <ChevronRight className="h-3 w-3" />
          </Link>
        )}
      </div>
      <div className="flex-1 space-y-2">{children}</div>
    </div>
  );
}

function ExecutiveCockpit({ orgId }: { orgId: string }) {
  const today = useQuery({
    queryKey: ["dashboard", "today", orgId],
    queryFn: () => api<TodayResp>(`/organization/${orgId}/dashboard/today`),
  });
  const teamHealth = useQuery({
    queryKey: ["team", "health-summary", orgId],
    queryFn: () => api<TeamHealthResp>(`/organization/${orgId}/team/health-summary`),
  });
  const overview = useQuery({
    queryKey: ["results-overview", orgId],
    queryFn: () => api<ResultsOverview>(`/organization/${orgId}/results-overview`),
  });
  const pendingActions = useQuery({
    queryKey: ["action-items", "pending", orgId],
    queryFn: () => api<PendingAction[]>(`/organization/${orgId}/action-items/pending`),
  });

  const goals = overview.data?.activeCycle?.goals ?? [];
  const totals = overview.data?.totals;

  return (
    <FadeIn delay={0.02}>
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          <Activity className="h-3.5 w-3.5" /> Painel executivo
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <CockpitCard
            icon={<Users2 className="h-3.5 w-3.5" />}
            title="Evolução da equipe"
            to="/app/team"
          >
            {teamHealth.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="font-display text-3xl">{teamHealth.data?.score ?? "—"}</span>
                  <span className="text-xs text-muted-foreground">/100</span>
                  {!!teamHealth.data?.delta && (
                    <span
                      className={
                        teamHealth.data.delta > 0
                          ? "text-xs text-emerald-600"
                          : "text-xs text-rose-600"
                      }
                    >
                      {teamHealth.data.delta > 0 ? "+" : ""}
                      {teamHealth.data.delta}
                    </span>
                  )}
                </div>
                {(teamHealth.data?.membersAtRisk ?? 0) > 0 && (
                  <div className="flex items-center gap-1 text-[11px] text-rose-600">
                    <AlertTriangle className="h-3 w-3" /> {teamHealth.data?.membersAtRisk}{" "}
                    colaborador(es) em risco
                  </div>
                )}
              </>
            )}
          </CockpitCard>

          <CockpitCard
            icon={<Target className="h-3.5 w-3.5" />}
            title="Indicadores"
            to="/app/indicators"
          >
            {overview.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : totals ? (
              <div className="flex items-center gap-3 text-sm">
                <span className="text-emerald-600">{totals.on_target} na meta</span>
                <span className="text-amber-600">{totals.warning} atenção</span>
                <span className="text-rose-600">{totals.off_target} fora</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">Sem indicadores ainda.</span>
            )}
          </CockpitCard>

          <CockpitCard
            icon={<ClipboardList className="h-3.5 w-3.5" />}
            title="Planos de ação"
            to="/app/organization/cycles"
          >
            {pendingActions.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (pendingActions.data ?? []).length === 0 ? (
              <span className="text-xs text-muted-foreground">Nenhuma ação pendente.</span>
            ) : (
              (pendingActions.data ?? []).slice(0, 3).map((a) => (
                <div key={a.id} className="text-xs">
                  <div className="truncate font-medium">{a.title}</div>
                  <div className="truncate text-muted-foreground">
                    {a.goal.title}
                    {a.dueAt ? ` · até ${new Date(a.dueAt).toLocaleDateString("pt-BR")}` : ""}
                  </div>
                </div>
              ))
            )}
          </CockpitCard>

          <CockpitCard
            icon={<ListChecks className="h-3.5 w-3.5" />}
            title="Atividades pendentes"
            to="/app"
          >
            {today.isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (today.data?.items ?? []).length === 0 ? (
              <span className="text-xs text-muted-foreground">Nada pendente agora.</span>
            ) : (
              (today.data?.items ?? []).slice(0, 3).map((it) => (
                <div key={it.id} className="text-xs">
                  <div className="truncate font-medium">{it.title}</div>
                  <div className="truncate text-muted-foreground">{it.subtitle}</div>
                </div>
              ))
            )}
          </CockpitCard>
        </div>

        {goals.length > 0 && overview.data?.activeCycle && (
          <div className="card-elevated p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                <TrendingUp className="h-3.5 w-3.5" /> Metas e resultados ·{" "}
                {overview.data.activeCycle.name}
              </div>
              <Link
                to="/app/organization/cycles"
                className="inline-flex items-center gap-0.5 text-[11px] font-medium text-accent hover:underline"
              >
                Abrir metas <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
            <ul className="space-y-2">
              {goals.slice(0, 5).map((g) => {
                const gap =
                  g.targetValue != null && g.currentValue != null
                    ? g.targetValue - g.currentValue
                    : null;
                const projected = overview.data?.activeCycle
                  ? projectGoal(g, overview.data.activeCycle)
                  : null;
                return (
                  <li
                    key={g.id}
                    className="rounded-xl border border-border/60 bg-background p-3 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${GOAL_DOT[g.status]}`} />
                      <span className="font-medium">{g.title}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                      {g.targetValue != null && (
                        <span>
                          Meta: <strong className="text-foreground">{g.targetValue}</strong>
                        </span>
                      )}
                      {g.currentValue != null && (
                        <span>
                          Atual: <strong className="text-foreground">{g.currentValue}</strong>
                        </span>
                      )}
                      {gap != null && (
                        <span>
                          Lacuna:{" "}
                          <strong className={gap > 0 ? "text-amber-600" : "text-emerald-600"}>
                            {gap}
                          </strong>
                        </span>
                      )}
                      {projected != null && g.targetValue != null && (
                        <span>
                          Projeção: no ritmo atual, deve fechar em{" "}
                          <strong
                            className={
                              projected >= g.targetValue ? "text-emerald-600" : "text-amber-600"
                            }
                          >
                            {projected}
                          </strong>
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>
    </FadeIn>
  );
}

function EvolutionPage() {
  return <EvolutionPageInner />;
}

function DimensionCard({
  icon,
  label,
  tone,
  dim,
}: {
  icon: React.ReactNode;
  label: string;
  tone: string;
  dim: Dimension;
}) {
  return (
    <div className="card-elevated p-5">
      <div className={"flex items-center gap-2 text-xs uppercase tracking-widest " + tone}>
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="metric-number text-4xl">{dim.score}</div>
        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">/100</div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{dim.diagnostic}</p>
      <div className="mt-4 space-y-2">
        {dim.parts.map((p) => (
          <div key={p.label}>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-foreground/80">{p.label}</span>
              <span className="text-muted-foreground">{Math.round(p.value * 100)}%</span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-accent"
                style={{ width: `${Math.round(p.value * 100)}%` }}
              />
            </div>
            {p.hint && <div className="mt-0.5 text-[10px] text-muted-foreground">{p.hint}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

function EvolutionPageInner() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["evolution", "me", orgId],
    enabled: !!orgId,
    queryFn: () => api<MeResponse>(`/organization/${orgId}/evolution/me`),
  });

  const timeline = useQuery({
    queryKey: ["evolution", "timeline", orgId],
    enabled: !!orgId,
    queryFn: () => api<TimelineEvent[]>(`/organization/${orgId}/evolution/timeline`),
  });

  const snapshot = useMutation({
    mutationFn: () => api(`/organization/${orgId}/evolution/snapshot`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Snapshot do mês registrado");
      qc.invalidateQueries({ queryKey: ["evolution", "me", orgId] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha"),
  });

  if (!orgId) return null;

  const current = data?.current;
  const trend = data?.trend ?? [];
  const commitments = data?.commitments ?? [];
  const prev = trend.length >= 2 ? trend[trend.length - 2] : null;
  const delta = current && prev ? current.score - prev.score : null;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <FadeIn>
        <SectionHeader
          eyebrow="Módulo E · Evolução"
          title="Score de sustentação"
          description="35% cadência dos rituais · 35% delegações no prazo · 30% indicadores dentro da meta. O número é consequência dos fatos."
          right={
            <Button
              variant="outline"
              className="gap-2"
              disabled={snapshot.isPending}
              onClick={() => snapshot.mutate()}
            >
              {snapshot.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Registrar snapshot
            </Button>
          }
        />
      </FadeIn>

      <ExecutiveCockpit orgId={orgId} />

      <div className="border-t border-border/60 pt-6">
        <div className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
          Evolução do líder
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Calculando…
        </div>
      )}

      {current && (
        <>
          <section className="grid gap-4 md:grid-cols-[1.1fr_1fr]">
            <FadeIn delay={0.05}>
              <div className="card-elevated relative overflow-hidden p-6">
                <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/20 blur-3xl" />
                <div className="eyebrow relative">Score atual</div>
                <div className="relative mt-2 flex items-center gap-6">
                  <ScoreGauge
                    value={current.score}
                    size={180}
                    center={
                      <>
                        <div className="metric-number text-5xl text-accent-gradient">
                          <CountUp value={current.score} />
                        </div>
                        <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                          /100
                        </div>
                      </>
                    }
                  />
                  <div className="min-w-0 flex-1">
                    {delta != null && (
                      <div
                        className={
                          "mb-2 inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                          (delta > 0
                            ? "bg-success/15 text-success"
                            : delta < 0
                              ? "bg-destructive/15 text-destructive"
                              : "bg-muted text-muted-foreground")
                        }
                      >
                        {delta > 0 ? "+" : ""}
                        {delta} vs mês anterior
                      </div>
                    )}
                    <p className="text-sm leading-relaxed text-foreground/90">
                      {current.diagnostic}
                    </p>
                  </div>
                </div>
              </div>
            </FadeIn>

            <FadeIn delay={0.1}>
              <div className="card-elevated p-6">
                <div className="eyebrow">Composição</div>
                <div className="mt-4">
                  <CompositionBars
                    segments={[
                      {
                        label: "Rituais (35%)",
                        value: current.breakdown.ritualsScore,
                        hint: `${current.breakdown.rituals.done}/${current.breakdown.rituals.planned} feitos em 30d`,
                      },
                      {
                        label: "Delegações (35%)",
                        value: current.breakdown.delegScore,
                        hint: `${current.breakdown.delegations.onTime}/${current.breakdown.delegations.total} no prazo · ${current.breakdown.delegations.overdue} atrasada(s)`,
                      },
                      {
                        label: "Indicadores (30%)",
                        value: current.breakdown.indicatorsScore,
                        hint: `${current.breakdown.indicators.onTarget}/${current.breakdown.indicators.withReadings} na meta`,
                      },
                    ]}
                  />
                </div>
              </div>
            </FadeIn>
          </section>

          <FadeIn delay={0.12}>
            <section>
              <div className="mb-3 flex items-end justify-between">
                <div>
                  <div className="eyebrow">Sustentação por dimensão</div>
                  <h3 className="mt-1 font-display text-xl">Radar de Autogestão (IPM)</h3>
                </div>
                <div className="text-xs text-muted-foreground">
                  O IPM mede sua capacidade de resposta consciente vs padrão automático.
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                <DimensionCard
                  icon={<Building2 className="h-4 w-4" />}
                  label="Autopercepção"
                  tone="text-sky-500"
                  dim={current.hard}
                />
                <DimensionCard
                  icon={<Users2 className="h-4 w-4" />}
                  label="Autorregulação"
                  tone="text-emerald-500"
                  dim={current.soft}
                />
                <DimensionCard
                  icon={<Heart className="h-4 w-4" />}
                  label="Escolha Consciente"
                  tone="text-rose-500"
                  dim={current.heart}
                />
              </div>
            </section>
          </FadeIn>

          <FadeIn delay={0.15}>
            <section className="card-elevated p-6">
              <div className="mb-4 flex items-end justify-between">
                <div>
                  <div className="eyebrow">Tendência</div>
                  <h3 className="mt-1 font-display text-xl">Últimos meses</h3>
                </div>
                <div className="text-xs text-muted-foreground">{trend.length} snapshot(s)</div>
              </div>
              {trend.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-secondary/20 p-6 text-sm text-muted-foreground">
                  Ainda não há snapshots. Clique em "Registrar snapshot" no fim de cada mês para
                  começar a tendência.
                </div>
              ) : (
                <TrendArea
                  data={trend.map((s) => ({
                    label: `${s.periodMonth.toString().padStart(2, "0")}/${String(s.periodYear).slice(2)}`,
                    value: s.score,
                  }))}
                  height={220}
                />
              )}
            </section>
          </FadeIn>

          <FadeIn delay={0.2}>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="eyebrow">Mentoria</div>
                  <h3 className="mt-1 font-display text-xl">Plano de ação</h3>
                </div>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {commitments.length} ativo(s)
                </span>
              </div>
              {commitments.length === 0 ? (
                <div className="rounded-xl border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                  Nenhum compromisso ativo. Registre em Consciência → Compromissos de mentoria.
                </div>
              ) : (
                <StaggerList className="space-y-2">
                  {commitments.map((c) => (
                    <StaggerItem key={c.id}>
                      <div className="card-elevated card-elevated-hover flex items-center gap-3 p-4">
                        <div className="grid h-8 w-8 place-items-center rounded-full bg-accent/10">
                          <Sparkles className="h-4 w-4 text-accent" />
                        </div>
                        <div className="text-sm font-medium">{c.phrase}</div>
                      </div>
                    </StaggerItem>
                  ))}
                </StaggerList>
              )}
            </section>
          </FadeIn>

          <FadeIn delay={0.25}>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <div className="eyebrow">Trilha do líder</div>
                  <h3 className="mt-1 font-display text-xl">Últimos 6 meses</h3>
                </div>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {timeline.data?.length ?? 0} evento(s)
                </span>
              </div>
              {timeline.isLoading ? (
                <div className="rounded-xl border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                  Montando trilha…
                </div>
              ) : (timeline.data?.length ?? 0) === 0 ? (
                <div className="rounded-xl border border-border bg-secondary/20 p-4 text-sm text-muted-foreground">
                  Ainda sem eventos. Assim que houver snapshots, delegações concluídas, PDIs ou
                  feedbacks, sua trilha começa a se formar.
                </div>
              ) : (
                <ol className="relative space-y-3 border-l border-border pl-5">
                  {timeline.data!.map((ev) => {
                    const Icon =
                      ev.kind === "snapshot"
                        ? TrendingUp
                        : ev.kind === "delegation"
                          ? CheckSquare
                          : ev.kind === "pdi"
                            ? Target
                            : MessageSquare;
                    return (
                      <li key={ev.id} className="relative">
                        <span className="absolute -left-[27px] top-1.5 grid h-5 w-5 place-items-center rounded-full border border-border bg-background text-muted-foreground">
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="rounded-xl border border-border bg-card p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="text-sm font-medium">{ev.title}</div>
                            <div className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
                              {new Date(ev.at).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "short",
                                year: "2-digit",
                              })}
                            </div>
                          </div>
                          {ev.detail && (
                            <div className="mt-1 text-xs text-muted-foreground">{ev.detail}</div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </FadeIn>
        </>
      )}
    </div>
  );
}
