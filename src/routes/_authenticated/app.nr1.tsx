import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ShieldAlert,
  Plus,
  Loader2,
  Copy,
  QrCode,
  ChevronRight,
  MessageSquareWarning,
  Lock,
  ClipboardCheck,
  ListChecks,
  Sparkles,
  ArrowRight,
  Activity,
  TriangleAlert,
} from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/app/nr1")({
  component: NR1Page,
  head: () => ({
    meta: [{ title: "NR-1 · LíderCore" }],
  }),
});

type SurveyStatus = "open" | "closed";
type Survey = {
  id: string;
  title: string;
  status: SurveyStatus;
  token: string;
  responseCount: number;
  avgScore: number | null;
  actionPlan: string | null;
  createdAt: string;
};
type Tabulation = { id: string; label: string; avg: number | null; count: number };
type SurveyDetail = Survey & { tabulation: Tabulation[] };
type AIAnalysis = {
  summary: string;
  priorities: Array<{ factor: string; evidence: string; recommendation: string }>;
  actionPlan: string;
  recommendedNextAssessment: {
    id: "completo" | "pulso" | "lideranca" | "assedio";
    reason: string;
  };
  generatedAt: string;
};
type ComplaintStatus = "open" | "in_review" | "resolved";
type Complaint = {
  id: string;
  message: string;
  category: string | null;
  status: ComplaintStatus;
  createdAt: string;
};
type Channel = { token: string };

function publicUrl(path: string, token: string) {
  if (typeof window === "undefined") return `/${path}/${token}`;
  return `${window.location.origin}/${path}/${token}`;
}
function qrImg(url: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(url)}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Link copiado");
  } catch {
    toast.error("Não foi possível copiar");
  }
}

function LinkAndQr({ url }: { url: string }) {
  const [showQr, setShowQr] = useState(false);
  return (
    <div className="flex items-center gap-1.5">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => copyText(url)}>
        <Copy className="h-3.5 w-3.5" /> Copiar link
      </Button>
      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5">
            <QrCode className="h-3.5 w-3.5" /> QR Code
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader>
            <DialogTitle>Escaneie para responder</DialogTitle>
          </DialogHeader>
          <div className="grid place-items-center py-2">
            <img
              src={qrImg(url)}
              alt="QR Code"
              className="h-44 w-44 rounded-lg border border-border"
            />
          </div>
          <p className="break-all text-center text-[11px] text-muted-foreground">{url}</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NR1Page() {
  const { orgId } = useCurrentOrg();
  if (!orgId) return null;
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-3xl border border-rose-200/70 bg-gradient-to-br from-rose-500/10 via-background to-amber-500/10 p-5 sm:p-7 dark:border-rose-500/25">
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> NR-1
        </div>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl">Gestão de riscos psicossociais</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Organize o ciclo de identificação, avaliação, priorização e acompanhamento. A IA analisa
          apenas resultados agregados e ajuda a preparar um plano para validação com SST.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {["1. Preparar", "2. Avaliar", "3. Analisar", "4. Agir e acompanhar"].map((step) => (
            <div
              key={step}
              className="rounded-xl border border-background/80 bg-background/75 px-3 py-2 text-xs font-semibold shadow-sm"
            >
              {step}
            </div>
          ))}
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-5">
        <div className="overflow-x-auto pb-1">
          <TabsList className="h-auto min-w-max justify-start">
            <TabsTrigger value="overview">Visão geral</TabsTrigger>
            <TabsTrigger value="assessments">Avaliações</TabsTrigger>
            <TabsTrigger value="risks">Riscos e ações</TabsTrigger>
            <TabsTrigger value="channel">Canal seguro</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="overview">
          <NR1Overview orgId={orgId} />
        </TabsContent>
        <TabsContent value="assessments" className="space-y-7">
          <AssessmentCatalog />
          <SurveysSection orgId={orgId} />
        </TabsContent>
        <TabsContent value="risks" className="space-y-7">
          <RiskWorkspace orgId={orgId} />
          <SurveysSection orgId={orgId} />
        </TabsContent>
        <TabsContent value="channel" className="space-y-7">
          <ComplaintChannelSection orgId={orgId} />
          <ComplaintsSection orgId={orgId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function NR1Overview({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ["nr1", "surveys", orgId],
    queryFn: () => api<Survey[]>(`/organization/${orgId}/nr1/surveys`),
  });
  const surveys = q.data ?? [];
  const latest = surveys[0];
  const responses = surveys.reduce((sum, survey) => sum + survey.responseCount, 0);
  const needsAction = surveys.filter(
    (survey) => survey.responseCount >= 3 && !survey.actionPlan,
  ).length;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          {
            label: "Rodadas",
            value: surveys.length,
            detail: `${surveys.filter((s) => s.status === "open").length} abertas`,
            icon: ClipboardCheck,
          },
          {
            label: "Respostas agregadas",
            value: responses,
            detail: "sem identificação individual",
            icon: Activity,
          },
          {
            label: "Planos pendentes",
            value: needsAction,
            detail: "rodadas prontas para análise",
            icon: ListChecks,
          },
        ].map(({ label, value, detail, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{label}</span>
              <Icon className="h-4 w-4" />
            </div>
            <div className="mt-2 text-2xl font-semibold tabular-nums">
              {q.isLoading ? "—" : value}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_.8fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-display text-xl">Próximo passo recomendado</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {!latest
              ? "Crie o diagnóstico completo para estabelecer a linha de base da organização."
              : latest.responseCount < 3
                ? `Compartilhe “${latest.title}” até obter ao menos 3 respostas para preservar o anonimato.`
                : !latest.actionPlan
                  ? `Abra “${latest.title}”, gere a análise agregada com IA e valide o plano de ação.`
                  : "Acompanhe a execução do plano e programe um pulso curto para verificar a evolução."}
          </p>
        </div>
        <div className="rounded-2xl border border-amber-200/70 bg-amber-500/5 p-5 dark:border-amber-500/25">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TriangleAlert className="h-4 w-4 text-amber-600" /> Uso responsável
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            O aplicativo apoia o processo e a documentação. A caracterização dos riscos e as medidas
            do PGR devem ser validadas por profissionais responsáveis por SST.
          </p>
        </div>
      </div>
    </div>
  );
}

const ASSESSMENTS = [
  {
    name: "Diagnóstico completo",
    when: "Linha de base e revisão periódica",
    detail:
      "Carga, autonomia, segurança psicológica, relações, reconhecimento, clareza, suporte e equilíbrio.",
    available: true,
  },
  {
    name: "Pulso de acompanhamento",
    when: "30–90 dias após iniciar ações",
    detail: "Confirma se as medidas adotadas estão melhorando a percepção das equipes.",
    available: false,
  },
  {
    name: "Apoio e práticas de liderança",
    when: "Quando autonomia, clareza ou suporte ficam baixos",
    detail: "Aprofunda fatores da organização e da atuação da liderança.",
    available: false,
  },
  {
    name: "Respeito, assédio e violência",
    when: "Quando há sinais de conflito, desrespeito ou medo",
    detail: "Deve ser aplicado com protocolo protegido e orientação especializada.",
    available: false,
  },
];

function AssessmentCatalog() {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="font-display text-xl">Qual avaliação enviar?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Comece amplo e aprofunde somente onde os dados indicarem necessidade.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {ASSESSMENTS.map((item) => (
          <div key={item.name} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-semibold">{item.name}</h3>
              <span
                className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${item.available ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-secondary text-muted-foreground"}`}
              >
                {item.available ? "Disponível" : "Próxima etapa"}
              </span>
            </div>
            <p className="mt-2 text-xs font-medium">Quando usar: {item.when}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function RiskWorkspace({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ["nr1", "surveys", orgId],
    queryFn: () => api<Survey[]>(`/organization/${orgId}/nr1/surveys`),
  });
  const ready = (q.data ?? []).filter((survey) => survey.responseCount >= 3);
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-2">
        <ListChecks className="h-5 w-5 text-rose-600" />
        <h2 className="font-display text-xl">Inventário e plano de ação</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Abra uma rodada com pelo menos 3 respostas para ver os fatores priorizados, solicitar a
        análise da IA e registrar o plano.{" "}
        {ready.length
          ? `${ready.length} rodada(s) pronta(s) para análise.`
          : "Ainda não há rodada com respostas suficientes."}
      </p>
    </section>
  );
}

function SurveysSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [openSurvey, setOpenSurvey] = useState<Survey | null>(null);

  const q = useQuery({
    queryKey: ["nr1", "surveys", orgId],
    queryFn: () => api<Survey[]>(`/organization/${orgId}/nr1/surveys`),
  });

  const create = useMutation({
    mutationFn: () =>
      api<Survey>(`/organization/${orgId}/nr1/surveys`, { method: "POST", body: { title } }),
    onSuccess: () => {
      toast.success("Diagnóstico criado.");
      setTitle("");
      setCreating(false);
      qc.invalidateQueries({ queryKey: ["nr1", "surveys", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const surveys = q.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Diagnóstico de riscos psicossociais</h2>
        <Dialog open={creating} onOpenChange={setCreating}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Nova rodada
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Nova rodada de diagnóstico</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Título</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Diagnóstico NR-1 · Equipe Comercial · Set/2026"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreating(false)}>
                Cancelar
              </Button>
              <Button disabled={!title || create.isPending} onClick={() => create.mutate()}>
                {create.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Criar e gerar link"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {q.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : surveys.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhuma rodada criada ainda. Crie uma e compartilhe o link ou QR Code com a equipe.
        </div>
      ) : (
        <ul className="space-y-2">
          {surveys.map((s) => (
            <li key={s.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setOpenSurvey(s)}
                  className="flex min-w-0 items-center gap-2 text-left"
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${s.status === "open" ? "bg-emerald-500" : "bg-muted-foreground"}`}
                  />
                  <span className="truncate font-medium">{s.title}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </button>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span>{s.responseCount} resposta(s)</span>
                  {s.avgScore != null && <span>· média {s.avgScore.toFixed(1)}/5</span>}
                </div>
              </div>
              <div className="mt-3">
                <LinkAndQr url={publicUrl("nr1", s.token)} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!openSurvey} onOpenChange={(o) => !o && setOpenSurvey(null)}>
        {openSurvey && (
          <SurveyDetailDialog
            orgId={orgId}
            survey={openSurvey}
            onClose={() => setOpenSurvey(null)}
          />
        )}
      </Dialog>
    </section>
  );
}

function SurveyDetailDialog({
  orgId,
  survey,
  onClose,
}: {
  orgId: string;
  survey: Survey;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [actionPlan, setActionPlan] = useState(survey.actionPlan ?? "");
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysis | null>(null);

  const detail = useQuery({
    queryKey: ["nr1", "survey", orgId, survey.id],
    queryFn: () => api<SurveyDetail>(`/organization/${orgId}/nr1/surveys/${survey.id}`),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["nr1", "survey", orgId, survey.id] });
    qc.invalidateQueries({ queryKey: ["nr1", "surveys", orgId] });
  };

  const toggleStatus = useMutation({
    mutationFn: () =>
      api(`/organization/${orgId}/nr1/surveys/${survey.id}`, {
        method: "PATCH",
        body: { status: survey.status === "open" ? "closed" : "open" },
      }),
    onSuccess: () => {
      toast.success("Status atualizado.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const savePlan = useMutation({
    mutationFn: () =>
      api(`/organization/${orgId}/nr1/surveys/${survey.id}`, {
        method: "PATCH",
        body: { actionPlan },
      }),
    onSuccess: () => {
      toast.success("Plano de ação salvo.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const analyze = useMutation({
    mutationFn: () =>
      api<AIAnalysis>(`/organization/${orgId}/nr1/surveys/${survey.id}/ai-analysis`, {
        method: "POST",
      }),
    onSuccess: (analysis) => {
      setAiAnalysis(analysis);
      setActionPlan(analysis.actionPlan);
      toast.success("Análise agregada gerada. Revise antes de salvar.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = detail.data?.tabulation ?? [];

  return (
    <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{survey.title}</DialogTitle>
        <p className="text-xs text-muted-foreground">
          Tabulação automática das respostas anônimas.
        </p>
      </DialogHeader>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {detail.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : t.every((x) => x.count === 0) ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Ainda sem respostas.
          </div>
        ) : (
          <ul className="space-y-2.5">
            {t.map((q) => (
              <li key={q.id}>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-foreground/90">{q.label}</span>
                  <span className="font-semibold">
                    {q.avg != null ? `${q.avg.toFixed(1)}/5` : "—"}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${q.avg != null && q.avg < 3 ? "bg-rose-500" : "bg-emerald-500"}`}
                    style={{ width: `${((q.avg ?? 0) / 5) * 100}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}

        {t.some((item) => item.count > 0) && (
          <div className="rounded-xl border border-violet-200/70 bg-violet-500/5 p-4 dark:border-violet-500/25">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Sparkles className="h-4 w-4 text-violet-600" /> Análise assistida por IA
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Usa somente médias agregadas. Exige ao menos 3 respostas.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => analyze.mutate()}
                disabled={analyze.isPending || (detail.data?.responseCount ?? 0) < 3}
              >
                {analyze.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                Analisar resultados
              </Button>
            </div>
            {aiAnalysis && (
              <div className="mt-4 space-y-3 text-sm">
                <p>{aiAnalysis.summary}</p>
                <ul className="space-y-2">
                  {aiAnalysis.priorities.map((priority) => (
                    <li key={priority.factor} className="rounded-lg bg-background/80 p-3">
                      <div className="font-semibold">{priority.factor}</div>
                      <div className="mt-1 text-xs text-muted-foreground">{priority.evidence}</div>
                      <div className="mt-1 text-xs">{priority.recommendation}</div>
                    </li>
                  ))}
                </ul>
                <div className="flex gap-2 rounded-lg border border-border bg-background/80 p-3 text-xs">
                  <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <strong>Próxima avaliação sugerida:</strong>{" "}
                    {ASSESSMENTS.find((item) =>
                      item.name
                        .toLowerCase()
                        .includes(
                          aiAnalysis.recommendedNextAssessment.id === "completo"
                            ? "completo"
                            : aiAnalysis.recommendedNextAssessment.id === "pulso"
                              ? "pulso"
                              : aiAnalysis.recommendedNextAssessment.id === "lideranca"
                                ? "liderança"
                                : "assédio",
                        ),
                    )?.name ?? aiAnalysis.recommendedNextAssessment.id}
                    . {aiAnalysis.recommendedNextAssessment.reason}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div>
          <Label>Plano de ação de melhoria</Label>
          <Textarea
            rows={3}
            className="resize-none"
            value={actionPlan}
            onChange={(e) => setActionPlan(e.target.value)}
            placeholder="O que será feito a partir deste diagnóstico?"
          />
          <div className="mt-2 flex justify-end">
            <Button size="sm" onClick={() => savePlan.mutate()} disabled={savePlan.isPending}>
              {savePlan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar plano"}
            </Button>
          </div>
        </div>
      </div>

      <DialogFooter className="flex-row justify-between sm:justify-between">
        <Button
          variant="outline"
          size="sm"
          onClick={() => toggleStatus.mutate()}
          disabled={toggleStatus.isPending}
        >
          {survey.status === "open" ? "Encerrar rodada" : "Reabrir rodada"}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Fechar
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

function ComplaintChannelSection({ orgId }: { orgId: string }) {
  const q = useQuery({
    queryKey: ["nr1", "complaint-channel", orgId],
    queryFn: () => api<Channel>(`/organization/${orgId}/nr1/complaint-channel`),
  });

  return (
    <section className="rounded-2xl border border-rose-200/60 bg-rose-500/5 p-5 dark:border-rose-500/25">
      <div className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300">
        <MessageSquareWarning className="h-4 w-4" /> Canal de denúncia anônima
      </div>
      <p className="mt-1.5 max-w-2xl text-xs text-muted-foreground">
        Link permanente da organização. Ninguém precisa de login, e nenhuma informação de quem
        denuncia é coletada. A denúncia chega apenas aos líderes autorizados (RH / responsável da
        organização).
      </p>
      {q.isLoading ? (
        <Loader2 className="mt-3 h-4 w-4 animate-spin text-muted-foreground" />
      ) : q.data ? (
        <div className="mt-3">
          <LinkAndQr url={publicUrl("nr1-denuncia", q.data.token)} />
        </div>
      ) : null}
    </section>
  );
}

const COMPLAINT_STATUS_META: Record<ComplaintStatus, { label: string; cls: string }> = {
  open: {
    label: "Aberta",
    cls: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
  },
  in_review: {
    label: "Em análise",
    cls: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
  },
  resolved: {
    label: "Resolvida",
    cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  },
};

function ComplaintsSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["nr1", "complaints", orgId],
    queryFn: () => api<Complaint[]>(`/organization/${orgId}/nr1/complaints`),
    retry: false,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: ComplaintStatus }) =>
      api(`/organization/${orgId}/nr1/complaints/${id}`, { method: "PATCH", body: { status } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["nr1", "complaints", orgId] }),
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isError) {
    return (
      <section className="flex items-center gap-2 rounded-2xl border border-border bg-secondary/30 p-5 text-sm text-muted-foreground">
        <Lock className="h-4 w-4" /> Denúncias visíveis apenas para RH / responsável da organização.
      </section>
    );
  }

  const complaints = q.data ?? [];

  return (
    <section className="space-y-3">
      <h2 className="font-display text-xl">Denúncias recebidas</h2>
      {q.isLoading ? (
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      ) : complaints.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          Nenhuma denúncia registrada.
        </div>
      ) : (
        <ul className="space-y-2">
          {complaints.map((c) => (
            <li key={c.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-sm">{c.message}</p>
                  <div className="mt-1.5 text-[11px] text-muted-foreground">
                    {c.category && `${c.category} · `}
                    {new Date(c.createdAt).toLocaleString("pt-BR")}
                  </div>
                </div>
                <Select
                  value={c.status}
                  onValueChange={(v) =>
                    setStatus.mutate({ id: c.id, status: v as ComplaintStatus })
                  }
                >
                  <SelectTrigger
                    className={`h-7 w-auto shrink-0 rounded-full border-0 px-2.5 text-[11px] font-semibold ${COMPLAINT_STATUS_META[c.status].cls}`}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Aberta</SelectItem>
                    <SelectItem value="in_review">Em análise</SelectItem>
                    <SelectItem value="resolved">Resolvida</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
