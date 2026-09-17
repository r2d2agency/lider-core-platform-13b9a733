import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  CheckCircle2,
  Download,
  Gauge,
  Loader2,
  Minus,
  Plus,
  Upload,
  X,
} from "lucide-react";
import { exportCsv } from "@/lib/csv-export";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/lib/use-current-org";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/indicators")({
  component: IndicatorsPage,
});

type Reading = {
  id: string;
  periodYear: number;
  periodMonth: number;
  value: number;
  source: string;
  notes?: string | null;
  plan?: string | null;
  doAction?: string | null;
  check?: string | null;
  act?: string | null;
};

type Indicator = {
  id: string;
  level: "area" | "team" | "leadership";
  name: string;
  description: string | null;
  unit: string | null;
  direction: "higher_better" | "lower_better";
  target: number | null;
  areaId: string | null;
  teamId: string | null;
  ownerUserId: string | null;
  tags: string[];
  active: boolean;
  readings: Reading[];
  lastReading: Reading | null;
  prevReading: Reading | null;
  delta: number | null;
  status: "on_target" | "off_target" | "warning" | "unknown";
};

type Concentration = {
  threshold: number;
  total: number;
  byLeader: Array<{
    leaderId: string;
    total: number;
    ownedByLeader: number;
    ratio: number;
    overThreshold: boolean;
  }>;
};

const LEVELS: Array<{ key: "area" | "team" | "leadership"; label: string; hint: string }> = [
  { key: "area", label: "Área", hint: "Resultado, produtividade, qualidade, prazo" },
  { key: "team", label: "Equipe", hint: "Clareza, combinados, autonomia, participação" },
  { key: "leadership", label: "Liderança", hint: "Rituais sustentados, decisões, feedbacks" },
];

function IndicatorsPage() {
  const { orgId } = useCurrentOrg();
  const [level, setLevel] = useState<"area" | "team" | "leadership">("area");

  const list = useQuery({
    queryKey: ["indicators", orgId, level],
    queryFn: () => api<Indicator[]>(`/organization/${orgId}/indicators?level=${level}`),
    enabled: !!orgId,
  });

  const concentration = useQuery({
    queryKey: ["indicators-concentration", orgId],
    queryFn: () => api<Concentration>(`/organization/${orgId}/indicators/concentration`),
    enabled: !!orgId,
  });

  if (!orgId) {
    return (
      <div className="mx-auto max-w-3xl">
        <p className="text-sm text-muted-foreground">Selecione uma organização.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <header className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
            <BarChart3 className="h-3.5 w-3.5" style={{ color: "var(--pilar-r)" }} /> Módulo
            Resultado
          </div>
          <h1 className="mt-1 font-display text-4xl">Indicadores</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Fatos, não impressão. Cadastre indicadores em três níveis e registre leituras mensais —
            o sistema lê o farol e sinaliza fora da meta e carga na própria mão.
          </p>
        </div>
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap lg:justify-end">
          <ImportCsvDialog orgId={orgId} triggerClassName="w-full sm:w-auto" />
          <Button
            variant="outline"
            className="min-w-0 gap-1 px-3 sm:w-auto"
            disabled={!list.data?.length}
            onClick={() =>
              exportCsv(
                `indicadores-${level}-${new Date().toISOString().slice(0, 10)}.csv`,
                list.data ?? [],
                [
                  { key: "name", label: "Nome" },
                  { key: "level", label: "Nível" },
                  { key: "unit", label: "Unidade" },
                  { key: "direction", label: "Direção" },
                  { key: "target", label: "Meta" },
                  { key: "status", label: "Farol" },
                  {
                    key: "lastValue",
                    label: "Última leitura",
                    get: (i) => i.lastReading?.value ?? "",
                  },
                  {
                    key: "lastPeriod",
                    label: "Período",
                    get: (i) =>
                      i.lastReading
                        ? `${String(i.lastReading.periodMonth).padStart(2, "0")}/${i.lastReading.periodYear}`
                        : "",
                  },
                  { key: "delta", label: "Delta vs anterior", get: (i) => i.delta ?? "" },
                ],
              )
            }
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </Button>
          <NewIndicatorDialog
            orgId={orgId}
            defaultLevel={level}
            triggerClassName="col-span-2 w-full sm:col-span-1 sm:w-auto"
          />
        </div>
      </header>

      <ConcentrationCard data={concentration.data} />

      <div>
        <div className="mb-2">
          <h2 className="text-sm font-semibold">Nível do indicador</h2>
          <p className="text-xs text-muted-foreground">
            Escolha onde o indicador atua: no resultado da área, na dinâmica da equipe ou na prática
            de liderança.
          </p>
        </div>
        <nav
          aria-label="Nível do indicador"
          className="grid grid-cols-3 gap-1.5 rounded-2xl bg-secondary/70 p-1.5"
        >
          {LEVELS.map((l) => (
            <button
              key={l.key}
              type="button"
              onClick={() => setLevel(l.key)}
              className={
                "min-w-0 rounded-xl border px-2 py-2.5 text-center text-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                (level === l.key
                  ? "border-border bg-card font-semibold text-foreground shadow-sm"
                  : "border-transparent text-muted-foreground hover:bg-card/60 hover:text-foreground")
              }
              aria-pressed={level === l.key}
            >
              <span className="block truncate">{l.label}</span>
              <span className="mt-0.5 hidden truncate text-[10px] font-normal text-muted-foreground md:block">
                {l.hint}
              </span>
            </button>
          ))}
        </nav>
        <p className="mt-2 px-1 text-xs text-muted-foreground md:hidden">
          <strong className="font-semibold text-foreground">
            {LEVELS.find((item) => item.key === level)?.label}:
          </strong>{" "}
          {LEVELS.find((item) => item.key === level)?.hint}.
        </p>
      </div>

      {list.isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : !list.data?.length ? (
        <EmptyLevel level={level} orgId={orgId} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {list.data.map((i) => (
            <IndicatorCard key={i.id} orgId={orgId} indicator={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function ConcentrationCard({ data }: { data: Concentration | undefined }) {
  if (!data) return null;
  const over = data.byLeader.filter((l) => l.overThreshold);
  const anyRisk = over.length > 0;
  return (
    <div
      className={
        "rounded-2xl border p-5 " +
        (anyRisk ? "border-accent/40 bg-accent/5" : "border-success/30 bg-success/5")
      }
    >
      <div className="flex items-start gap-3">
        <div
          className={
            "flex h-10 w-10 items-center justify-center rounded-full " +
            (anyRisk ? "bg-accent/15 text-accent" : "bg-success/15 text-success")
          }
        >
          <Gauge className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            Carga na própria mão
          </div>
          <div className="mt-0.5 font-display text-xl">
            {anyRisk
              ? `${over.length} líder${over.length > 1 ? "es" : ""} acima do limiar de ${Math.round(data.threshold * 100)}%`
              : "Distribuição saudável entre os líderes"}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            % das delegações ativas sob responsabilidade direta do próprio líder. Acima de{" "}
            {Math.round(data.threshold * 100)}% indica risco de centralização.
          </p>
          {anyRisk && (
            <ul className="mt-3 grid gap-1.5 text-sm">
              {over.slice(0, 5).map((l) => (
                <li
                  key={l.leaderId}
                  className="flex justify-between rounded-md bg-background/60 px-3 py-1.5"
                >
                  <span className="text-muted-foreground">
                    líder <code className="text-foreground">{l.leaderId.slice(0, 8)}</code>
                  </span>
                  <span className="font-medium">
                    {Math.round(l.ratio * 100)}% ({l.ownedByLeader}/{l.total})
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function IndicatorCard({ orgId, indicator }: { orgId: string; indicator: Indicator }) {
  const qc = useQueryClient();
  const [openReading, setOpenReading] = useState(false);

  const remove = useMutation({
    mutationFn: () =>
      api(`/organization/${orgId}/indicators/${indicator.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indicators", orgId] });
      qc.invalidateQueries({ queryKey: ["leadership-room", orgId] });
      toast.success("Indicador removido");
    },
  });

  const statusStyle =
    indicator.status === "on_target"
      ? "border-success/40 bg-success/5"
      : indicator.status === "warning"
        ? "border-warning/40 bg-warning/5"
        : indicator.status === "off_target"
          ? "border-destructive/40 bg-destructive/5"
          : "border-border";

  const statusLabel =
    indicator.status === "on_target"
      ? "Dentro da meta"
      : indicator.status === "warning"
        ? "Perto do limite"
        : indicator.status === "off_target"
          ? "Fora da meta"
          : "Sem leitura";

  return (
    <div className={"rounded-2xl border p-5 " + statusStyle}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <span>{statusLabel}</span>
            <span>•</span>
            <span>
              {indicator.direction === "higher_better"
                ? "quanto mais, melhor"
                : "quanto menos, melhor"}
            </span>
          </div>
          <h3 className="mt-1 truncate font-display text-lg">{indicator.name}</h3>
          {indicator.description && (
            <p className="mt-1 text-sm text-muted-foreground">{indicator.description}</p>
          )}
        </div>
        <button
          type="button"
          onClick={() => confirm(`Remover "${indicator.name}"?`) && remove.mutate()}
          className="rounded-md p-1.5 text-muted-foreground hover:text-destructive"
          aria-label="Remover indicador"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <Metric
          label="Última leitura"
          value={
            indicator.lastReading
              ? `${fmt(indicator.lastReading.value)}${indicator.unit ?? ""}`
              : "—"
          }
          hint={
            indicator.lastReading
              ? `${String(indicator.lastReading.periodMonth).padStart(2, "0")}/${indicator.lastReading.periodYear}`
              : undefined
          }
        />
        <Metric
          label="Meta"
          value={indicator.target != null ? `${fmt(indicator.target)}${indicator.unit ?? ""}` : "—"}
        />
        <Metric
          label="Variação"
          value={
            indicator.delta == null ? (
              "—"
            ) : (
              <span className="inline-flex items-center gap-1">
                {indicator.delta > 0 ? (
                  <ArrowUp className="h-3.5 w-3.5" />
                ) : indicator.delta < 0 ? (
                  <ArrowDown className="h-3.5 w-3.5" />
                ) : (
                  <Minus className="h-3.5 w-3.5" />
                )}
                {fmt(Math.abs(indicator.delta))}
                {indicator.unit ?? ""}
              </span>
            )
          }
        />
      </div>

      <Sparkline readings={indicator.readings} />
      {indicator.lastReading &&
        (indicator.lastReading.plan ||
          indicator.lastReading.doAction ||
          indicator.lastReading.check ||
          indicator.lastReading.act) && (
          <div className="mt-4 rounded-xl border border-border/70 bg-background/60 p-3">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              PDCA da última leitura
            </div>
            <dl className="mt-2 grid gap-1.5 text-xs">
              {indicator.lastReading.plan && (
                <div className="flex gap-2">
                  <dt className="w-4 font-semibold text-accent">P</dt>
                  <dd className="text-foreground/80">{indicator.lastReading.plan}</dd>
                </div>
              )}
              {indicator.lastReading.doAction && (
                <div className="flex gap-2">
                  <dt className="w-4 font-semibold text-accent">D</dt>
                  <dd className="text-foreground/80">{indicator.lastReading.doAction}</dd>
                </div>
              )}
              {indicator.lastReading.check && (
                <div className="flex gap-2">
                  <dt className="w-4 font-semibold text-accent">C</dt>
                  <dd className="text-foreground/80">{indicator.lastReading.check}</dd>
                </div>
              )}
              {indicator.lastReading.act && (
                <div className="flex gap-2">
                  <dt className="w-4 font-semibold text-accent">A</dt>
                  <dd className="text-foreground/80">{indicator.lastReading.act}</dd>
                </div>
              )}
            </dl>
          </div>
        )}

      <div className="mt-4 flex justify-end">
        <Dialog open={openReading} onOpenChange={setOpenReading}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm">
              <Plus className="mr-1 h-3.5 w-3.5" /> Registrar leitura
            </Button>
          </DialogTrigger>
          <NewReadingContent
            orgId={orgId}
            indicator={indicator}
            onDone={() => setOpenReading(false)}
          />
        </Dialog>
      </div>
    </div>
  );
}

function Metric({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-display text-lg">{value}</div>
      {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function Sparkline({ readings }: { readings: Reading[] }) {
  const sorted = useMemo(
    () =>
      [...readings].sort(
        (a, b) => a.periodYear * 12 + a.periodMonth - (b.periodYear * 12 + b.periodMonth),
      ),
    [readings],
  );
  if (sorted.length < 2) return null;
  const values = sorted.map((r) => r.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 260;
  const h = 40;
  const step = w / (sorted.length - 1);
  const points = sorted.map((r, i) => `${i * step},${h - ((r.value - min) / range) * h}`).join(" ");
  return (
    <div className="mt-4">
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full text-foreground/70">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function NewReadingContent({
  orgId,
  indicator,
  onDone,
}: {
  orgId: string;
  indicator: Indicator;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  const [plan, setPlan] = useState("");
  const [doAction, setDoAction] = useState("");
  const [check, setCheck] = useState("");
  const [act, setAct] = useState("");
  const [showPdca, setShowPdca] = useState(false);

  const create = useMutation({
    mutationFn: () =>
      api(`/organization/${orgId}/indicators/${indicator.id}/readings`, {
        method: "POST",
        body: {
          periodYear: year,
          periodMonth: month,
          value: Number(String(value).replace(",", ".")),
          notes: notes || undefined,
          plan: plan || undefined,
          doAction: doAction || undefined,
          check: check || undefined,
          act: act || undefined,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indicators", orgId] });
      qc.invalidateQueries({ queryKey: ["leadership-room", orgId] });
      toast.success("Leitura registrada");
      onDone();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Registrar leitura — {indicator.name}</DialogTitle>
      </DialogHeader>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Mês</Label>
            <Input
              type="number"
              min={1}
              max={12}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ano</Label>
            <Input
              type="number"
              min={2000}
              max={2100}
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>
            Valor{" "}
            {indicator.unit && <span className="text-muted-foreground">({indicator.unit})</span>}
          </Label>
          <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Ex.: 87.5" />
        </div>
        <div className="space-y-1.5">
          <Label>Notas (opcional)</Label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Contexto da leitura"
          />
        </div>
        <button
          type="button"
          onClick={() => setShowPdca((v) => !v)}
          className="text-left text-xs font-medium uppercase tracking-widest text-accent hover:underline"
        >
          {showPdca ? "− Esconder PDCA" : "+ Ciclo PDCA (Plan · Do · Check · Act)"}
        </button>
        {showPdca && (
          <div className="grid gap-3 rounded-xl border border-dashed border-border p-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                P · Plan — o que planejou
              </Label>
              <Textarea
                rows={2}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                placeholder="Hipótese e plano de ação"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                D · Do — o que executou
              </Label>
              <Textarea
                rows={2}
                value={doAction}
                onChange={(e) => setDoAction(e.target.value)}
                placeholder="Ações reais no período"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                C · Check — o que aprendeu
              </Label>
              <Textarea
                rows={2}
                value={check}
                onChange={(e) => setCheck(e.target.value)}
                placeholder="Resultado vs. planejado"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] uppercase tracking-widest text-muted-foreground">
                A · Act — o que muda agora
              </Label>
              <Textarea
                rows={2}
                value={act}
                onChange={(e) => setAct(e.target.value)}
                placeholder="Ajuste para o próximo ciclo"
              />
            </div>
          </div>
        )}
      </div>
      <DialogFooter>
        <Button onClick={() => create.mutate()} disabled={!value || create.isPending}>
          {create.isPending ? "Salvando…" : "Salvar leitura"}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function NewIndicatorDialog({
  orgId,
  defaultLevel,
  triggerClassName,
}: {
  orgId: string;
  defaultLevel: "area" | "team" | "leadership";
  triggerClassName?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    level: defaultLevel,
    unit: "",
    direction: "higher_better" as "higher_better" | "lower_better",
    target: "",
    description: "",
  });

  const create = useMutation({
    mutationFn: () =>
      api(`/organization/${orgId}/indicators`, {
        method: "POST",
        body: {
          name: form.name,
          level: form.level,
          unit: form.unit || null,
          direction: form.direction,
          target: form.target ? Number(form.target.replace(",", ".")) : null,
          description: form.description || null,
        },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indicators", orgId] });
      toast.success("Indicador criado");
      setOpen(false);
      setForm({ ...form, name: "", unit: "", target: "", description: "" });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className={triggerClassName}>
          <Plus className="mr-1 h-4 w-4" /> Novo indicador
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo indicador</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Ex.: Aderência a prazo"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nível</Label>
              <Select
                value={form.level}
                onValueChange={(v) => setForm({ ...form, level: v as never })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="area">Área</SelectItem>
                  <SelectItem value="team">Equipe</SelectItem>
                  <SelectItem value="leadership">Liderança</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Direção</Label>
              <Select
                value={form.direction}
                onValueChange={(v) => setForm({ ...form, direction: v as never })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="higher_better">Quanto mais, melhor</SelectItem>
                  <SelectItem value="lower_better">Quanto menos, melhor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Meta</Label>
              <Input
                value={form.target}
                onChange={(e) => setForm({ ...form, target: e.target.value })}
                placeholder="Ex.: 95"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Unidade</Label>
              <Input
                value={form.unit}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
                placeholder="%, R$, un, dias"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Como é calculado, fonte, quem revisa"
            />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
            {create.isPending ? "Criando…" : "Criar indicador"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportCsvDialog({
  orgId,
  triggerClassName,
}: {
  orgId: string;
  triggerClassName?: string;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");

  const submit = useMutation({
    mutationFn: () =>
      api<{ imported: number; skipped: number; total: number }>(
        `/organization/${orgId}/indicators/import`,
        { method: "POST", body: { csv } },
      ),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["indicators", orgId] });
      toast.success(`Importadas ${r.imported}/${r.total} leituras (${r.skipped} ignoradas)`);
      setOpen(false);
      setCsv("");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className={triggerClassName}>
          <Upload className="mr-1 h-4 w-4" /> Importar CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importar leituras via CSV</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Colunas aceitas: <code>name,level,unit,target,year,month,value</code> — cria o indicador
            se não existir. Ou <code>indicatorId,year,month,value</code> para adicionar leituras em
            indicadores já existentes.
          </p>
          <Textarea
            value={csv}
            onChange={(e) => setCsv(e.target.value)}
            placeholder={
              "name,level,unit,target,year,month,value\nAderência a prazo,area,%,95,2026,7,88\n..."
            }
            className="min-h-[220px] font-mono text-xs"
          />
        </div>
        <DialogFooter>
          <Button onClick={() => submit.mutate()} disabled={!csv.trim() || submit.isPending}>
            {submit.isPending ? "Importando…" : "Importar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyLevel({ level, orgId }: { level: "area" | "team" | "leadership"; orgId: string }) {
  const meta = LEVELS.find((l) => l.key === level)!;
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <CheckCircle2 className="mx-auto h-8 w-8 text-muted-foreground" />
      <h3 className="mt-3 font-display text-xl">Nenhum indicador de {meta.label} ainda</h3>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Comece com 2–3 indicadores. Sugestões para {meta.label}: {meta.hint}.
      </p>
      <div className="mt-4 flex justify-center gap-2">
        <NewIndicatorDialog orgId={orgId} defaultLevel={level} />
      </div>
    </div>
  );
}

function fmt(n: number) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}
