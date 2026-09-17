import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  Activity,
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronRight,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

  if (!data.activeCycle || data.activeCycle.goals.length === 0 || total === 0) {
    return (
      <div className="space-y-8">
        <ResultsHeader />
        <ResultsSetup orgId={orgId} overview={data} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <ResultsHeader />

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

function ResultsHeader() {
  return (
    <header className="rounded-3xl border border-border bg-card p-5 shadow-sm md:p-7">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-600">
            Módulo Resultado · Alcançar metas
          </div>
          <h1 className="mt-2 font-display text-3xl md:text-4xl">Gestão à vista</h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Comece pelo que o time precisa entregar e acompanhe os sinais que antecipam o resultado
            — antes do fim do ciclo.
          </p>
        </div>
        <Link
          to="/app/indicators"
          className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
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
  );
}

type TeamMember = { userId: string; fullName: string };
type CreatedCycle = { id: string };
type CreatedGoal = { id: string };
type CreatedIndicator = { id: string };

function ResultsSetup({ orgId, overview }: { orgId: string; overview: Overview }) {
  const queryClient = useQueryClient();
  const activeCycle = overview.activeCycle;
  const firstGoal = activeCycle?.goals[0] ?? null;
  const stage = !activeCycle ? "cycle" : !firstGoal ? "goal" : "indicator";
  const today = toDateInput(new Date());
  const ninetyDaysFromNow = toDateInput(new Date(Date.now() + 90 * 24 * 60 * 60 * 1000));

  const [cycleName, setCycleName] = useState("Ciclo de resultados");
  const [startAt, setStartAt] = useState(today);
  const [endAt, setEndAt] = useState(ninetyDaysFromNow);
  const [goalTitle, setGoalTitle] = useState("");
  const [measurable, setMeasurable] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDueAt, setGoalDueAt] = useState(ninetyDaysFromNow);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [indicatorName, setIndicatorName] = useState("");
  const [indicatorUnit, setIndicatorUnit] = useState("");
  const [indicatorTarget, setIndicatorTarget] = useState("");
  const [currentValue, setCurrentValue] = useState("");
  const [direction, setDirection] = useState<"higher_better" | "lower_better">("higher_better");
  const [submitError, setSubmitError] = useState<string | null>(null);

  const membersQ = useQuery({
    queryKey: ["team-members", orgId],
    queryFn: () => api<TeamMember[]>(`/organization/${orgId}/team`),
  });

  const refreshResults = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["results-overview", orgId] }),
      queryClient.invalidateQueries({ queryKey: ["results-mvr", orgId] }),
      queryClient.invalidateQueries({ queryKey: ["cycles", orgId] }),
      queryClient.invalidateQueries({ queryKey: ["indicators", orgId] }),
    ]);
  };

  const save = useMutation({
    mutationFn: async () => {
      setSubmitError(null);
      if (stage === "cycle") {
        const cycle = await api<CreatedCycle>(`/organization/${orgId}/cycles`, {
          method: "POST",
          body: {
            name: cycleName.trim(),
            status: "active",
            startAt: new Date(`${startAt}T12:00:00`).toISOString(),
            endAt: new Date(`${endAt}T12:00:00`).toISOString(),
            summary: measurable.trim() || null,
          },
        });
        await createGoal(orgId, cycle.id, {
          title: goalTitle,
          measurable,
          target: goalTarget,
          dueAt: goalDueAt,
          ownerUserId,
        });
        return "Meta do time criada. Agora defina o indicador que antecipa o resultado.";
      }

      if (stage === "goal") {
        await createGoal(orgId, activeCycle!.id, {
          title: goalTitle,
          measurable,
          target: goalTarget,
          dueAt: goalDueAt,
          ownerUserId,
        });
        return "Meta do time criada. Agora defina o indicador que antecipa o resultado.";
      }

      const target = parseLocalizedNumber(indicatorTarget);
      const indicator = await api<CreatedIndicator>(`/organization/${orgId}/indicators`, {
        method: "POST",
        body: {
          level: "team",
          name: indicatorName.trim(),
          description: `Indicador de atividade ligado à meta: ${firstGoal!.title}`,
          unit: indicatorUnit.trim() || null,
          direction,
          target,
          tags: ["meta-do-time"],
          active: true,
        },
      });

      const current = currentValue.trim() ? parseLocalizedNumber(currentValue) : null;
      await api(`/organization/${orgId}/cycles/${activeCycle!.id}/goals/${firstGoal!.id}`, {
        method: "PATCH",
        body: {
          indicatorId: indicator.id,
          targetValue: target,
          ...(current != null ? { currentValue: current } : {}),
        },
      });

      if (current != null) {
        const now = new Date();
        await api(`/organization/${orgId}/indicators/${indicator.id}/readings`, {
          method: "POST",
          body: {
            periodYear: now.getFullYear(),
            periodMonth: now.getMonth() + 1,
            value: current,
            notes: "Leitura inicial registrada na configuração do módulo Resultado.",
          },
        });
      }
      return "Indicador vinculado. Seu painel de resultados está pronto.";
    },
    onSuccess: async (message) => {
      await refreshResults();
      toast.success(message);
    },
    onError: async (error: Error) => {
      // Se o ciclo foi criado mas a meta falhou, a atualização evita criar um ciclo duplicado
      // na tentativa seguinte e leva o usuário diretamente para a etapa que falta.
      await refreshResults();
      setSubmitError(error.message);
      toast.error("Não foi possível salvar esta etapa.");
    },
  });

  const goalFieldsValid =
    goalTitle.trim().length >= 2 &&
    measurable.trim().length >= 2 &&
    goalTarget.trim() !== "" &&
    goalDueAt !== "";
  const canSubmit =
    stage === "cycle"
      ? cycleName.trim().length >= 2 &&
        startAt !== "" &&
        endAt !== "" &&
        startAt <= endAt &&
        goalFieldsValid
      : stage === "goal"
        ? goalFieldsValid
        : indicatorName.trim().length >= 1 && indicatorTarget.trim() !== "";

  const activeStep = stage === "indicator" ? 2 : 1;

  return (
    <section className="overflow-hidden rounded-3xl border border-rose-500/20 bg-card shadow-sm">
      <div className="grid lg:grid-cols-[300px_1fr]">
        <aside className="bg-rose-500/[0.05] p-5 md:p-7">
          <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-rose-600">
            Configuração guiada
          </div>
          <h2 className="mt-2 font-display text-2xl">Comece pela meta, não pelo indicador</h2>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Primeiro registre o que a equipe precisa entregar. Depois escolha o sinal controlável
            que mostra, com antecedência, se a meta será alcançada.
          </p>
          <ol className="mt-6 space-y-4">
            {[
              ["Meta do time", "Resultado, prazo e responsável"],
              ["Indicador de atividade", "Meta, leitura atual e direção"],
              ["Agir sobre a lacuna", "Desdobramento e plano de ação"],
            ].map(([title, description], index) => {
              const step = index + 1;
              const done = step < activeStep;
              const active = step === activeStep;
              return (
                <li key={title} className="flex gap-3">
                  <span
                    className={
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold " +
                      (done || active
                        ? "bg-rose-600 text-white"
                        : "border border-border bg-background text-muted-foreground")
                    }
                  >
                    {done ? <CheckCircle2 className="h-4 w-4" /> : step}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{title}</span>
                    <span className="block text-xs text-muted-foreground">{description}</span>
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

        <form
          noValidate
          className="p-5 md:p-7"
          onSubmit={(event) => {
            event.preventDefault();
            if (canSubmit && !save.isPending) save.mutate();
          }}
        >
          <div className="mb-6">
            <div className="text-xs font-semibold text-rose-600">Etapa {activeStep} de 3</div>
            <h2 className="mt-1 font-display text-2xl">
              {stage === "indicator"
                ? "Qual atividade antecipa o resultado?"
                : "O que o time precisa entregar?"}
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {stage === "indicator"
                ? `A meta “${firstGoal?.title}” já existe. Agora cadastre um indicador que a equipe consiga influenciar no dia a dia.`
                : "Defina uma entrega mensurável. O indicador virá na próxima etapa, ligado a esta meta."}
            </p>
          </div>

          {stage === "cycle" && (
            <fieldset className="mb-6 grid gap-4 rounded-2xl border border-border bg-secondary/30 p-4 sm:grid-cols-3">
              <legend className="px-1 text-xs font-semibold">Período de acompanhamento</legend>
              <div className="sm:col-span-3">
                <Label htmlFor="result-cycle-name">Nome do ciclo</Label>
                <Input
                  id="result-cycle-name"
                  value={cycleName}
                  onChange={(event) => setCycleName(event.target.value)}
                  placeholder="Ex.: Resultados do 4º trimestre"
                />
              </div>
              <div>
                <Label htmlFor="result-cycle-start">Início</Label>
                <Input
                  id="result-cycle-start"
                  type="date"
                  value={startAt}
                  onChange={(event) => setStartAt(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="result-cycle-end">Fim</Label>
                <Input
                  id="result-cycle-end"
                  type="date"
                  value={endAt}
                  onChange={(event) => setEndAt(event.target.value)}
                />
              </div>
            </fieldset>
          )}

          {stage !== "indicator" ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="result-goal-title">Meta do time</Label>
                <Input
                  id="result-goal-title"
                  value={goalTitle}
                  onChange={(event) => setGoalTitle(event.target.value)}
                  placeholder="Ex.: Atingir R$ 500 mil em vendas por mês"
                  aria-describedby="result-goal-title-help"
                />
                <p id="result-goal-title-help" className="mt-1 text-xs text-muted-foreground">
                  Escreva a entrega da equipe, não uma tarefa individual.
                </p>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="result-goal-measurable">Como saberemos que foi alcançada?</Label>
                <Textarea
                  id="result-goal-measurable"
                  className="resize-none"
                  rows={3}
                  value={measurable}
                  onChange={(event) => setMeasurable(event.target.value)}
                  placeholder="Ex.: Receita reconhecida no mês, excluindo cancelamentos"
                />
              </div>
              <div>
                <Label htmlFor="result-goal-target">Valor-alvo</Label>
                <Input
                  id="result-goal-target"
                  inputMode="decimal"
                  value={goalTarget}
                  onChange={(event) => setGoalTarget(event.target.value)}
                  placeholder="500000"
                />
              </div>
              <div>
                <Label htmlFor="result-goal-due">Prazo</Label>
                <Input
                  id="result-goal-due"
                  type="date"
                  value={goalDueAt}
                  onChange={(event) => setGoalDueAt(event.target.value)}
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="result-goal-owner">Responsável pela meta</Label>
                <Select
                  value={ownerUserId || "unassigned"}
                  onValueChange={(value) => setOwnerUserId(value === "unassigned" ? "" : value)}
                >
                  <SelectTrigger id="result-goal-owner">
                    <SelectValue placeholder="Definir depois" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unassigned">Definir depois</SelectItem>
                    {(membersQ.data ?? []).map((member) => (
                      <SelectItem key={member.userId} value={member.userId}>
                        {member.fullName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="result-indicator-name">Indicador de atividade</Label>
                <Input
                  id="result-indicator-name"
                  value={indicatorName}
                  onChange={(event) => setIndicatorName(event.target.value)}
                  placeholder="Ex.: Reuniões comerciais por semana"
                  aria-describedby="result-indicator-help"
                />
                <p id="result-indicator-help" className="mt-1 text-xs text-muted-foreground">
                  Prefira algo que a equipe controla, como reuniões, propostas ou tempo de resposta.
                </p>
              </div>
              <div>
                <Label htmlFor="result-indicator-target">Meta do indicador</Label>
                <Input
                  id="result-indicator-target"
                  inputMode="decimal"
                  value={indicatorTarget}
                  onChange={(event) => setIndicatorTarget(event.target.value)}
                  placeholder="Ex.: 80"
                />
              </div>
              <div>
                <Label htmlFor="result-indicator-current">Valor atual (opcional)</Label>
                <Input
                  id="result-indicator-current"
                  inputMode="decimal"
                  value={currentValue}
                  onChange={(event) => setCurrentValue(event.target.value)}
                  placeholder="Ex.: 55"
                />
              </div>
              <div>
                <Label htmlFor="result-indicator-unit">Unidade</Label>
                <Input
                  id="result-indicator-unit"
                  value={indicatorUnit}
                  onChange={(event) => setIndicatorUnit(event.target.value)}
                  placeholder="Ex.: reuniões, %, R$"
                />
              </div>
              <div>
                <Label htmlFor="result-indicator-direction">O que representa melhora?</Label>
                <Select
                  value={direction}
                  onValueChange={(value) => setDirection(value as typeof direction)}
                >
                  <SelectTrigger id="result-indicator-direction">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="higher_better">Quanto maior, melhor</SelectItem>
                    <SelectItem value="lower_better">Quanto menor, melhor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {submitError && (
            <div
              role="alert"
              className="mt-5 rounded-xl border border-rose-500/30 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300"
            >
              <strong>Não foi possível salvar.</strong> {submitError}
            </div>
          )}

          <div className="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              Você poderá editar e detalhar tudo depois em Metas do time.
            </p>
            <Button
              type="submit"
              disabled={!canSubmit || save.isPending}
              className="min-w-44 gap-2"
            >
              {save.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Salvando
                </>
              ) : (
                <>
                  {stage === "indicator" ? "Concluir configuração" : "Salvar e continuar"}
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </form>
      </div>
    </section>
  );
}

async function createGoal(
  orgId: string,
  cycleId: string,
  values: {
    title: string;
    measurable: string;
    target: string;
    dueAt: string;
    ownerUserId: string;
  },
) {
  return api<CreatedGoal>(`/organization/${orgId}/cycles/${cycleId}/goals`, {
    method: "POST",
    body: {
      title: values.title.trim(),
      specific: values.title.trim(),
      measurable: values.measurable.trim(),
      achievable: null,
      relevant: null,
      timeBound: values.dueAt,
      targetValue: parseLocalizedNumber(values.target),
      dueAt: new Date(`${values.dueAt}T12:00:00`).toISOString(),
      ownerUserId: values.ownerUserId || null,
      status: "on_track",
    },
  });
}

function parseLocalizedNumber(value: string) {
  const normalized = value
    .trim()
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error("Informe um valor numérico válido.");
  return parsed;
}

function toDateInput(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
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
