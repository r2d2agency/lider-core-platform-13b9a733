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
  Paperclip,
  Pencil,
  Trash2,
  X,
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
type Tabulation = {
  id: string;
  label: string;
  factors?: string[];
  average: number | null;
  percent: number | null;
  validCount: number;
};
type FactorResult = {
  id: string;
  name: string;
  average: number | null;
  percent: number | null;
  validCount: number;
  classification: "muito_favoravel" | "atencao" | "prioridade" | null;
};
type FactorAnalysis = {
  id: string;
  factorId: string;
  text: string | null;
  contexts: string[];
  decision: "criar_acao" | "acao_existente" | "acompanhar" | "sem_acao" | null;
};
type SurveyDetail = Survey & {
  tabulation: Tabulation[];
  factors: FactorResult[];
  resultAvailable: boolean;
  insufficientMessage: string | null;
  previousLabel: string | null;
  previousFactors: FactorResult[];
  factorAnalyses: FactorAnalysis[];
};
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
type ActionStatus = "not_started" | "in_progress" | "completed" | "overdue" | "cancelled";
type NR1ActionEvidence = {
  url: string;
  path: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
};
type NR1ActionHistory = {
  event: string;
  at: string;
  by: string;
  note?: string;
};
type NR1Action = {
  id: string;
  situation: string;
  description: string;
  origin: string;
  factorId: string | null;
  responsibleLabel: string | null;
  dueDate: string | null;
  status: ActionStatus;
  followUpMethod: string | null;
  result: string | null;
  outcome: "improved" | "partially_improved" | "unchanged" | "worsened" | "not_assessable" | null;
  sufficiency: "sufficient" | "partial" | "insufficient" | "pending" | null;
  sufficiencyNote: string | null;
  nextCheckAt: string | null;
  cancelReason: string | null;
  surveyId: string | null;
  evidence: NR1ActionEvidence[];
  history: NR1ActionHistory[];
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

  // Evolução entre ciclos: busca detalhes das 2 pesquisas mais recentes com resultados
  const evolutionQuery = useQuery({
    queryKey: ["nr1", "evolution", orgId],
    queryFn: async () => {
      const withResults = surveys.filter((s) => s.responseCount >= 3).slice(0, 2);
      if (withResults.length < 2) return null;
      const details = await Promise.all(
        withResults.map((s) =>
          api<SurveyDetail>(`/organization/${orgId}/nr1/surveys/${s.id}`),
        ),
      );
      const [current, previous] = details;
      if (!current?.factors || !previous?.factors) return null;

      const variations = current.factors
        .map((f) => {
          const prev = previous.factors.find((p) => p.id === f.id);
          if (!prev) return null;
          const delta = (f.percent ?? 0) - (prev.percent ?? 0);
          return { factor: f, delta };
        })
        .filter((v): v is { factor: FactorResult; delta: number } => v !== null)
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, 3);

      return { current, previous, variations };
    },
    enabled: surveys.filter((s) => s.responseCount >= 3).length >= 2,
  });

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

      {evolutionQuery.data && evolutionQuery.data.variations.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg">Evolução entre ciclos</h2>
            <span className="text-xs text-muted-foreground">
              {evolutionQuery.data.previous.title} → {evolutionQuery.data.current.title}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {evolutionQuery.data.variations.map(({ factor, delta }) => (
              <div key={factor.id} className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{factor.name}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    {factor.percent?.toFixed(0) ?? "—"}% atual
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    delta > 0
                      ? "bg-emerald-500/10 text-emerald-700"
                      : delta < 0
                        ? "bg-rose-500/10 text-rose-700"
                        : "bg-muted text-muted-foreground"
                  }`}
                >
                  {delta > 0 ? `▲ +${delta.toFixed(0)}%` : delta < 0 ? `▼ ${delta.toFixed(0)}%` : "—"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Fatores com maior variação entre as duas rodadas mais recentes.
          </p>
        </div>
      )}

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
  const qc = useQueryClient();
  const [status, setStatus] = useState<"all" | ActionStatus>("all");
  const [creating, setCreating] = useState(false);
  const [situation, setSituation] = useState("");
  const [description, setDescription] = useState("");
  const [factorId, setFactorId] = useState("");
  const [origin, setOrigin] = useState("leader_identification");
  const [dueDate, setDueDate] = useState("");
  const [responsibleLabel, setResponsibleLabel] = useState("");
  const [followUpMethod, setFollowUpMethod] = useState("");
  const [selectedAction, setSelectedAction] = useState<NR1Action | null>(null);
  const [editingAction, setEditingAction] = useState(false);
  const [editSituation, setEditSituation] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editResponsible, setEditResponsible] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editFollowUp, setEditFollowUp] = useState("");
  const [editResult, setEditResult] = useState("");
  const [editOutcome, setEditOutcome] = useState<NR1Action["outcome"]>(null);
  const [editSufficiency, setEditSufficiency] = useState<NR1Action["sufficiency"] | "">("pending" as NR1Action["sufficiency"]);
  const [editSufficiencyNote, setEditSufficiencyNote] = useState("");
  const [editNextCheckAt, setEditNextCheckAt] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [progressKind, setProgressKind] = useState<"progress" | "impediment" | "adjustment" | "conclusion">("progress");
  const [progressNote, setProgressNote] = useState("");

  const actions = useQuery({
    queryKey: ["nr1", "actions", orgId, status],
    queryFn: () => api<NR1Action[]>(`/organization/${orgId}/nr1/actions${status === "all" ? "" : `?status=${status}`}`),
  });
  const create = useMutation({
    mutationFn: () => api<NR1Action>(`/organization/${orgId}/nr1/actions`, {
      method: "POST",
      body: {
        situation, description, factorId: factorId || null, origin,
        dueDate: dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : null,
        responsibleLabel: responsibleLabel || null,
        followUpMethod: followUpMethod || null,
      },
    }),
    onSuccess: () => {
      toast.success("Ação criada.");
      setCreating(false); setSituation(""); setDescription(""); setFactorId(""); setOrigin("leader_identification"); setDueDate(""); setResponsibleLabel(""); setFollowUpMethod("");
      qc.invalidateQueries({ queryKey: ["nr1", "actions", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const update = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Partial<NR1Action> }) => api<NR1Action>(`/organization/${orgId}/nr1/actions/${id}`, { method: "PATCH", body: next }),
    onSuccess: () => { toast.success("Ação atualizada."); qc.invalidateQueries({ queryKey: ["nr1", "actions", orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/organization/${orgId}/nr1/actions/${id}`, { method: "DELETE" }),
    onSuccess: () => { toast.success("Ação excluída."); setSelectedAction(null); qc.invalidateQueries({ queryKey: ["nr1", "actions", orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const addProgress = useMutation({
    mutationFn: (actionId: string) => api<NR1Action>(`/organization/${orgId}/nr1/actions/${actionId}/progress`, {
      method: "POST",
      body: { kind: progressKind, note: progressNote },
    }),
    onSuccess: () => { toast.success("Registro adicionado."); setProgressNote(""); qc.invalidateQueries({ queryKey: ["nr1", "actions", orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const uploadEvidence = useMutation({
    mutationFn: (actionId: string) => {
      if (!evidenceFile) return Promise.reject(new Error("Selecione um arquivo."));
      const body = new FormData();
      body.append("file", evidenceFile);
      return api<NR1Action>(`/organization/${orgId}/nr1/actions/${actionId}/evidence`, { method: "POST", body });
    },
    onSuccess: () => { toast.success("Evidência anexada."); setEvidenceFile(null); qc.invalidateQueries({ queryKey: ["nr1", "actions", orgId] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const openDetail = (action: NR1Action) => {
    setSelectedAction(action);
    setEditingAction(false);
    setEditSituation(action.situation);
    setEditDescription(action.description);
    setEditResponsible(action.responsibleLabel ?? "");
    setEditDueDate(action.dueDate?.slice(0, 10) ?? "");
    setEditFollowUp(action.followUpMethod ?? "");
    setEditResult(action.result ?? "");
    setEditOutcome(action.outcome ?? null);
    setEditSufficiency(action.sufficiency ?? "pending");
    setEditSufficiencyNote(action.sufficiencyNote ?? "");
    setEditNextCheckAt(action.nextCheckAt?.slice(0, 10) ?? "");
    setCancelReason(action.cancelReason ?? "");
    setEvidenceFile(null);
    setProgressKind("progress");
    setProgressNote("");
  };
  const list = actions.data ?? [];
  const statusLabels: Record<ActionStatus, string> = { not_started: "Não iniciada", in_progress: "Em andamento", completed: "Concluída", overdue: "Atrasada", cancelled: "Cancelada" };
  const originLabels: Record<string, string> = { core_assessment: "Avaliação C.O.R.E.", risk_inventory: "Inventário de riscos", existing_action_plan: "Plano de ação existente", external_assessment: "Avaliação externa", leader_identification: "Identificação do líder", other: "Outra origem" };
  const factors = [
    ["assedio", "Assédio"], ["gestao_mudancas", "Gestão de mudanças"], ["clareza_papel", "Clareza de papel/função"], ["reconhecimento", "Reconhecimento"], ["suporte", "Suporte/apoio"], ["controle_autonomia", "Controle/autonomia"], ["justica_organizacional", "Justiça organizacional"], ["eventos_violentos", "Eventos violentos/traumáticos"], ["baixa_demanda", "Baixa demanda/subcarga"], ["excesso_demandas", "Excesso de demandas"], ["relacoes_trabalho", "Relações no trabalho"], ["comunicacao", "Comunicação"], ["trabalho_remoto", "Trabalho remoto/isolado"],
  ];
  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2"><ListChecks className="h-5 w-5 text-rose-600" /><h2 className="font-display text-xl">Riscos e ações da minha equipe</h2></div>
        <Button size="sm" onClick={() => setCreating((v) => !v)}><Plus className="mr-1.5 h-4 w-4" /> Nova ação</Button>
      </div>
      <p className="text-xs text-muted-foreground">Registre o que foi identificado, o que será feito, quem fará, até quando e como acompanhar. Uma ação concluída significa que foi executada; a suficiência será verificada no acompanhamento.</p>
      {creating && <div className="space-y-3 rounded-xl border border-border bg-background p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label>Situação / risco identificado</Label><Input className="mt-1" value={situation} onChange={(e) => setSituation(e.target.value)} placeholder="Ex.: Excesso de demandas na equipe" /></div>
          <div><Label>Fator relacionado</Label><Select value={factorId} onValueChange={setFactorId}><SelectTrigger className="mt-1"><SelectValue placeholder="Selecione um fator" /></SelectTrigger><SelectContent>{factors.map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
        </div>
        <div><Label>O que será feito?</Label><Textarea className="mt-1 resize-none" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Descreva a medida ou ação preventiva." /></div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><Label>Origem</Label><Select value={origin} onValueChange={setOrigin}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(originLabels).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Responsável</Label><Input className="mt-1" value={responsibleLabel} onChange={(e) => setResponsibleLabel(e.target.value)} placeholder="Nome ou área" /></div>
          <div><Label>Prazo</Label><Input className="mt-1" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></div>
        </div>
        <div><Label>Como vamos acompanhar?</Label><Input className="mt-1" value={followUpMethod} onChange={(e) => setFollowUpMethod(e.target.value)} placeholder="Ex.: reunião mensal, indicador, nova avaliação" /></div>
        <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>Cancelar</Button><Button onClick={() => create.mutate()} disabled={create.isPending || !situation.trim() || !description.trim()}>{create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar ação"}</Button></div>
      </div>}
      <div className="flex flex-wrap gap-1.5">{([["all", "Todos"], ["not_started", "Não iniciadas"], ["in_progress", "Em andamento"], ["overdue", "Atrasadas"], ["completed", "Concluídas"], ["cancelled", "Canceladas"]] as const).map(([value, label]) => <button key={value} onClick={() => setStatus(value)} className={`rounded-full border px-3 py-1 text-xs ${status === value ? "border-transparent bg-accent-gradient font-semibold text-white" : "border-border hover:border-accent/50"}`}>{label}</button>)}</div>
      {actions.isLoading ? <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /> : list.length === 0 ? <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">Nenhuma ação registrada neste filtro.</div> : <div className="space-y-2">{list.map((action) => {
        const overdue = action.dueDate && new Date(action.dueDate) < new Date() && !["completed", "cancelled"].includes(action.status);
        return <button key={action.id} type="button" onClick={() => openDetail(action)} className="block w-full rounded-xl border border-border p-4 text-left transition hover:border-accent/50 hover:bg-accent/5">
          <div className="flex flex-wrap items-start justify-between gap-2"><div><div className="text-sm font-semibold">{action.situation}</div><div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{action.description}</div></div><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${overdue || action.status === "overdue" ? "bg-rose-500/10 text-rose-700" : action.status === "completed" ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700"}`}>{overdue ? "Atrasada" : statusLabels[action.status]}</span></div>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground"><span>Fator: {factors.find(([id]) => id === action.factorId)?.[1] ?? "Não informado"}</span><span>Origem: {originLabels[action.origin] ?? action.origin}</span><span>Responsável: {action.responsibleLabel ?? "Não definido"}</span>{action.dueDate && <span>Prazo: {new Date(action.dueDate).toLocaleDateString("pt-BR")}</span>}{action.evidence.length > 0 && <span className="inline-flex items-center gap-1"><Paperclip className="h-3 w-3" />{action.evidence.length} evidência{action.evidence.length > 1 ? "s" : ""}</span>}</div>
        </button>;
      })}</div>}
      <Dialog open={Boolean(selectedAction)} onOpenChange={(open) => !open && setSelectedAction(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          {selectedAction && <>
            <DialogHeader><DialogTitle>{selectedAction.situation}</DialogTitle></DialogHeader>
            {editingAction ? <div className="space-y-3">
              <div><Label>Situação / risco identificado</Label><Input className="mt-1" value={editSituation} onChange={(e) => setEditSituation(e.target.value)} /></div>
              <div><Label>O que será feito?</Label><Textarea className="mt-1 resize-none" rows={4} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-3"><div><Label>Responsável</Label><Input className="mt-1" value={editResponsible} onChange={(e) => setEditResponsible(e.target.value)} /></div><div><Label>Prazo</Label><Input className="mt-1" type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} /></div><div><Label>Acompanhamento</Label><Input className="mt-1" value={editFollowUp} onChange={(e) => setEditFollowUp(e.target.value)} /></div></div>
              <div><Label>Resultado observado</Label><Textarea className="mt-1 resize-none" rows={3} value={editResult} onChange={(e) => setEditResult(e.target.value)} placeholder="O que mudou após a execução da ação?" /></div>
              <div className="grid gap-3 sm:grid-cols-3"><div><Label>O que mudou?</Label><Select value={editOutcome ?? ""} onValueChange={(value) => setEditOutcome(value ? value as NR1Action["outcome"] : null)}><SelectTrigger className="mt-1"><SelectValue placeholder="Avaliar resultado" /></SelectTrigger><SelectContent><SelectItem value="improved">Melhorou</SelectItem><SelectItem value="partially_improved">Melhorou parcialmente</SelectItem><SelectItem value="unchanged">Não mudou</SelectItem><SelectItem value="worsened">Piorou</SelectItem><SelectItem value="not_assessable">Não avaliável</SelectItem></SelectContent></Select></div><div><Label>Ação foi suficiente?</Label><Select value={editSufficiency || undefined} onValueChange={(value) => setEditSufficiency(value as NR1Action["sufficiency"] | "")}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pendente</SelectItem><SelectItem value="sufficient">Suficiente</SelectItem><SelectItem value="partial">Parcialmente suficiente</SelectItem><SelectItem value="insufficient">Insuficiente</SelectItem></SelectContent></Select></div><div><Label>Próxima verificação</Label><Input className="mt-1" type="date" value={editNextCheckAt} onChange={(e) => setEditNextCheckAt(e.target.value)} /></div></div>
              <div><Label>Observações de suficiência</Label><Textarea className="mt-1 resize-none" rows={2} value={editSufficiencyNote} onChange={(e) => setEditSufficiencyNote(e.target.value)} placeholder="Explique o que ainda é necessário para resolver a situação." /></div>
              {selectedAction.status === "cancelled" && <div><Label>Justificativa do cancelamento</Label><Textarea className="mt-1 resize-none" rows={2} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></div>}
              <div className="flex justify-end gap-2"><Button variant="ghost" onClick={() => setEditingAction(false)}>Cancelar</Button><Button onClick={() => update.mutate({ id: selectedAction.id, next: { situation: editSituation, description: editDescription, responsibleLabel: editResponsible || null, dueDate: editDueDate ? new Date(`${editDueDate}T23:59:59`).toISOString() : null, followUpMethod: editFollowUp || null, result: editResult || null, outcome: editOutcome, sufficiency: editSufficiency || null, sufficiencyNote: editSufficiencyNote || null, nextCheckAt: editNextCheckAt ? new Date(`${editNextCheckAt}T23:59:59`).toISOString() : null, cancelReason: cancelReason || null } })} disabled={update.isPending}>{update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar alterações"}</Button></div>
            </div> : <div className="space-y-4">
              <div className="flex flex-wrap gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${selectedAction.status === "completed" ? "bg-emerald-500/10 text-emerald-700" : selectedAction.status === "cancelled" ? "bg-muted text-muted-foreground" : "bg-amber-500/10 text-amber-700"}`}>{statusLabels[selectedAction.status]}</span><span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{originLabels[selectedAction.origin] ?? selectedAction.origin}</span></div>
              <p className="text-sm leading-relaxed text-muted-foreground">{selectedAction.description}</p>
              <div className="grid gap-3 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-2"><div><span className="text-muted-foreground">Fator: </span>{factors.find(([id]) => id === selectedAction.factorId)?.[1] ?? "Não informado"}</div><div><span className="text-muted-foreground">Responsável: </span>{selectedAction.responsibleLabel ?? "Não definido"}</div><div><span className="text-muted-foreground">Prazo: </span>{selectedAction.dueDate ? new Date(selectedAction.dueDate).toLocaleDateString("pt-BR") : "Não definido"}</div><div><span className="text-muted-foreground">Acompanhamento: </span>{selectedAction.followUpMethod ?? "Não definido"}</div></div>
              {selectedAction.result && <div><Label className="text-xs">Resultado observado</Label><p className="mt-1 rounded-xl border border-border p-3 text-sm">{selectedAction.result}</p></div>}
              {(selectedAction.outcome || selectedAction.sufficiency) && <div className="grid gap-3 rounded-xl bg-muted/40 p-3 text-sm sm:grid-cols-3"><div><span className="text-muted-foreground">O que mudou: </span>{selectedAction.outcome === "improved" ? "Melhorou" : selectedAction.outcome === "partially_improved" ? "Melhorou parcialmente" : selectedAction.outcome === "unchanged" ? "Não mudou" : selectedAction.outcome === "worsened" ? "Piorou" : selectedAction.outcome === "not_assessable" ? "Não avaliável" : "Não avaliado"}</div><div><span className="text-muted-foreground">Suficiência: </span>{selectedAction.sufficiency === "sufficient" ? "Suficiente" : selectedAction.sufficiency === "partial" ? "Parcialmente suficiente" : selectedAction.sufficiency === "insufficient" ? "Insuficiente" : "Pendente"}</div><div><span className="text-muted-foreground">Próxima verificação: </span>{selectedAction.nextCheckAt ? new Date(selectedAction.nextCheckAt).toLocaleDateString("pt-BR") : "Não definida"}</div></div>}
              {selectedAction.sufficiencyNote && <div><Label className="text-xs">Observações de suficiência</Label><p className="mt-1 rounded-xl border border-border p-3 text-sm">{selectedAction.sufficiencyNote}</p></div>}
              {selectedAction.cancelReason && <div><Label className="text-xs">Justificativa do cancelamento</Label><p className="mt-1 rounded-xl border border-border p-3 text-sm">{selectedAction.cancelReason}</p></div>}
              <div className="space-y-2 rounded-xl border border-border p-3">
                <Label className="text-xs">Histórico de execução</Label>
                {selectedAction.history.length === 0 ? <p className="mt-1 text-xs text-muted-foreground">Nenhum registro ainda.</p> : <div className="mt-2 space-y-2">{[...selectedAction.history].reverse().map((item, index) => <div key={`${item.at}-${index}`} className="flex gap-2 text-xs"><span className="shrink-0 font-medium text-muted-foreground">{new Date(item.at).toLocaleDateString("pt-BR")}</span><span><strong>{item.event === "created" ? "Ação criada" : item.event === "progress" ? "Progresso" : item.event === "impediment" ? "Impedimento" : item.event === "adjustment" ? "Ajuste" : item.event === "conclusion" ? "Conclusão" : item.event.startsWith("status:") ? `Status: ${item.event.split(":")[1]}` : item.event}</strong>{item.note ? ` — ${item.note}` : ""}</span></div>)}</div>}
                <div className="grid gap-2 sm:grid-cols-[160px_1fr_auto]"><Select value={progressKind} onValueChange={(value) => setProgressKind(value as typeof progressKind)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="progress">Progresso</SelectItem><SelectItem value="impediment">Impedimento</SelectItem><SelectItem value="adjustment">Ajuste</SelectItem><SelectItem value="conclusion">Conclusão</SelectItem></SelectContent></Select><Input value={progressNote} onChange={(e) => setProgressNote(e.target.value)} placeholder="Registrar o que aconteceu" /><Button size="sm" onClick={() => addProgress.mutate(selectedAction.id)} disabled={!progressNote.trim() || addProgress.isPending}>Adicionar</Button></div>
              </div>
              <div className="space-y-2"><div className="flex items-center justify-between"><Label className="text-xs">Evidências anexadas</Label><span className="text-xs text-muted-foreground">{selectedAction.evidence.length} arquivo{selectedAction.evidence.length === 1 ? "" : "s"}</span></div>{selectedAction.evidence.length > 0 && <div className="space-y-1">{selectedAction.evidence.map((item, index) => <a key={`${item.uploadedAt}-${index}`} href={item.url} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs hover:border-accent/50"><Paperclip className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{item.originalName}</span><span className="ml-auto shrink-0 text-muted-foreground">{(item.size / 1024).toFixed(0)} KB</span></a>)}</div>}<div className="flex items-center gap-2"><Input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt" onChange={(e) => setEvidenceFile(e.target.files?.[0] ?? null)} /><Button size="sm" onClick={() => uploadEvidence.mutate(selectedAction.id)} disabled={!evidenceFile || uploadEvidence.isPending}><Paperclip className="mr-1.5 h-4 w-4" />{uploadEvidence.isPending ? "Anexando…" : "Anexar"}</Button></div></div>
              <div className="flex flex-wrap justify-end gap-2 border-t pt-3"><Button variant="outline" size="sm" className="text-rose-600" onClick={() => remove.mutate(selectedAction.id)} disabled={remove.isPending}><Trash2 className="mr-1.5 h-4 w-4" />Excluir</Button><Button size="sm" onClick={() => setEditingAction(true)}><Pencil className="mr-1.5 h-4 w-4" />Editar ação</Button></div>
            </div>}
          </>}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function SurveysSection({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [creatingCycle, setCreatingCycle] = useState(false);
  const [title, setTitle] = useState("");
  const [cycleTitle, setCycleTitle] = useState("");
  const [cycleTeamId, setCycleTeamId] = useState("");
  const [comparePrevious, setComparePrevious] = useState(true);
  const [openSurvey, setOpenSurvey] = useState<Survey | null>(null);

  const q = useQuery({
    queryKey: ["nr1", "surveys", orgId],
    queryFn: () => api<Survey[]>(`/organization/${orgId}/nr1/surveys`),
  });

  const teamsQuery = useQuery({
    queryKey: ["teams", orgId],
    queryFn: () => api<Array<{ id: string; name: string }>>(`/organization/${orgId}/teams`),
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

  const createCycle = useMutation({
    mutationFn: () =>
      api<Survey>(`/organization/${orgId}/nr1/surveys`, {
        method: "POST",
        body: {
          title: cycleTitle,
          teamId: cycleTeamId || null,
        },
      }),
    onSuccess: (survey) => {
      toast.success("Novo ciclo criado.");
      setCycleTitle("");
      setCycleTeamId("");
      setCreatingCycle(false);
      qc.invalidateQueries({ queryKey: ["nr1", "surveys", orgId] });
      setOpenSurvey(survey);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const surveys = q.data ?? [];
  const hasPrevious = surveys.some((s) => s.responseCount >= 3);
  const teams = teamsQuery.data ?? [];

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-xl">Diagnóstico de riscos psicossociais</h2>
        <div className="flex gap-2">
          <Dialog open={creatingCycle} onOpenChange={setCreatingCycle}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1.5">
                <Activity className="h-3.5 w-3.5" /> Novo ciclo
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Novo ciclo de diagnóstico</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Título</Label>
                  <Input
                    value={cycleTitle}
                    onChange={(e) => setCycleTitle(e.target.value)}
                    placeholder="Ex: Diagnóstico NR-1 · Equipe Comercial · Out/2026"
                  />
                </div>
                {teams.length > 0 && (
                  <div className="space-y-2">
                    <Label>Equipe (opcional)</Label>
                    <Select value={cycleTeamId} onValueChange={setCycleTeamId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecione uma equipe" />
                      </SelectTrigger>
                      <SelectContent>
                        {teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>
                            {t.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {hasPrevious && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={comparePrevious}
                      onChange={(e) => setComparePrevious(e.target.checked)}
                      className="h-4 w-4 rounded border-input"
                    />
                    Comparar com ciclo anterior
                  </label>
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setCreatingCycle(false)}>
                  Cancelar
                </Button>
                <Button
                  disabled={!cycleTitle || createCycle.isPending}
                  onClick={() => createCycle.mutate()}
                >
                  {createCycle.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Criar ciclo"
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
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
  const factors = detail.data?.factors ?? [];
  const previousFactors = detail.data?.previousFactors ?? [];
  const analyses = detail.data?.factorAnalyses ?? [];
  const [selectedFactor, setSelectedFactor] = useState<string | null>(null);
  const attentionFactors = factors.filter(
    (f) => f.classification === "prioridade" || f.classification === "atencao",
  );
  const order = { prioridade: 0, atencao: 1, muito_favoravel: 2 } as const;
  const sortedFactors = [...factors].sort(
    (a, b) =>
      (order[a.classification ?? "muito_favoravel"] - order[b.classification ?? "muito_favoravel"]) ||
      (a.percent ?? 100) - (b.percent ?? 100),
  );

  return (
    <DialogContent className="flex max-h-[92vh] flex-col overflow-hidden sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{survey.title}</DialogTitle>
        <p className="text-xs text-muted-foreground">
          {detail.data?.resultAvailable
            ? `Resultado agregado · ${detail.data.previousLabel ? `Comparação com "${detail.data.previousLabel}"` : "Ainda não há uma avaliação anterior para comparação."}`
            : "Resultado das respostas anônimas da equipe."}
        </p>
      </DialogHeader>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {detail.isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : !detail.data?.resultAvailable ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {detail.data?.insufficientMessage ?? "Ainda sem respostas."}
          </div>
        ) : selectedFactor ? (
          <FactorDetailView
            orgId={orgId}
            surveyId={survey.id}
            factor={factors.find((f) => f.id === selectedFactor)!}
            previous={previousFactors.find((f) => f.id === selectedFactor) ?? null}
            questions={t.filter((q) => q.factors?.includes(selectedFactor))}
            analysis={analyses.find((a) => a.factorId === selectedFactor) ?? null}
            onBack={() => {
              setSelectedFactor(null);
              invalidate();
            }}
          />
        ) : (
          <>
            {attentionFactors.length > 0 && (
              <div className="rounded-xl border border-amber-300/70 bg-amber-500/5 p-4 dark:border-amber-500/25">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TriangleAlert className="h-4 w-4 text-amber-600" /> Fatores que merecem atenção
                  na sua equipe
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {attentionFactors.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedFactor(f.id)}
                      className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium transition hover:border-accent/50"
                    >
                      {f.name} · {f.percent?.toFixed(0)}%
                    </button>
                  ))}
                </div>
              </div>
            )}

            {previousFactors.length > 0 && (
              <div className="rounded-xl border border-border p-4">
                <h3 className="text-sm font-semibold">Comparação com ciclo anterior</h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  {detail.data?.previousLabel
                    ? `Comparando com "${detail.data.previousLabel}"`
                    : "Comparação com a rodada anterior"}
                </p>
                <div className="mt-3 space-y-2">
                  {sortedFactors.map((factor) => {
                    const prev = previousFactors.find((p) => p.id === factor.id);
                    if (!prev) return null;
                    const delta = (factor.percent ?? 0) - (prev.percent ?? 0);
                    const improved = delta > 0;
                    const worsened = delta < 0;
                    return (
                      <button
                        key={factor.id}
                        onClick={() => setSelectedFactor(factor.id)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-left transition hover:border-accent/50"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{factor.name}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            Anterior: {prev.percent?.toFixed(0) ?? "—"}% → Atual: {factor.percent?.toFixed(0) ?? "—"}%
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                            improved
                              ? "bg-emerald-500/10 text-emerald-700"
                              : worsened
                                ? "bg-rose-500/10 text-rose-700"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {delta > 0 ? `▲ +${delta.toFixed(0)}%` : delta < 0 ? `▼ ${delta.toFixed(0)}%` : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Visão geral dos 13 fatores</h3>
              {sortedFactors.map((factor) => (
                <button
                  key={factor.id}
                  onClick={() => setSelectedFactor(factor.id)}
                  className="block w-full text-left"
                >
                  <FactorCard factor={factor} previous={previousFactors.find((p) => p.id === factor.id) ?? null} />
                </button>
              ))}
            </div>

            <details className="rounded-xl border border-border p-3">
              <summary className="cursor-pointer text-sm font-semibold">Detalhamento das 33 perguntas</summary>
              <ul className="mt-3 space-y-2.5">
                {t.map((q) => (
                  <li key={q.id}>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-foreground/90">{q.label}</span>
                      <span className="shrink-0 font-semibold">
                        {q.percent != null ? `${q.percent.toFixed(1)}%` : "—"}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className={`h-full rounded-full ${q.percent != null && q.percent < 50 ? "bg-rose-500" : q.percent != null && q.percent < 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                        style={{ width: `${q.percent ?? 0}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </details>
          </>
        )}

        {detail.data?.resultAvailable && (
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

function FactorCard({ factor, previous }: { factor: FactorResult; previous: FactorResult | null }) {
  const tone =
    factor.classification === "prioridade"
      ? "border-rose-300 bg-rose-500/5"
      : factor.classification === "atencao"
        ? "border-amber-300 bg-amber-500/5"
        : "border-emerald-300 bg-emerald-500/5";
  const bar =
    factor.classification === "prioridade"
      ? "bg-rose-500"
      : factor.classification === "atencao"
        ? "bg-amber-500"
        : "bg-emerald-500";
  const label =
    factor.classification === "prioridade"
      ? "Prioridade"
      : factor.classification === "atencao"
        ? "Atenção"
        : factor.classification === "muito_favoravel"
          ? "Muito favorável"
          : "Sem dados";
  const delta =
    previous?.percent != null && factor.percent != null
      ? factor.percent - previous.percent
      : null;
  return (
    <div className={`rounded-xl border p-3 transition hover:border-accent/50 ${tone}`}>
      <div className="flex items-start justify-between gap-3 text-xs">
        <span className="flex items-center gap-1.5 font-medium text-foreground/90">
          {factor.name}
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        </span>
        <span className="flex shrink-0 items-center gap-2 font-semibold">
          {delta != null && (
            <span
              className={`text-[10px] font-semibold ${delta >= 0 ? "text-emerald-600" : "text-rose-600"}`}
            >
              {delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(1)} pts
            </span>
          )}
          {factor.percent != null ? `${factor.percent.toFixed(1)}%` : "—"} · {label}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${bar}`} style={{ width: `${factor.percent ?? 0}%` }} />
      </div>
      {factor.average != null && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Média {factor.average.toFixed(2)}/5 · {factor.validCount} respostas válidas
        </p>
      )}
    </div>
  );
}

const FACTOR_DESCRIPTIONS: Record<string, string> = {
  assedio:
    "Relacionado à percepção sobre tolerância a situações de constrangimento, humilhação, intimidação, discriminação ou qualquer forma de assédio, e à existência de caminhos claros para agir e recorrer.",
  gestao_mudancas:
    "Relacionado à percepção sobre comunicação, estrutura e suporte diante de mudanças que impactam o trabalho.",
  clareza_papel:
    "Relacionado à percepção sobre clareza de responsabilidades, prioridades, resultados esperados e consistência das orientações recebidas.",
  reconhecimento:
    "Relacionado à percepção sobre valorização, elogios e reconhecimento pelo bom trabalho e esforço.",
  suporte:
    "Relacionado à percepção sobre apoio da liderança imediata, dos colegas e da organização diante de problemas e necessidades de aprendizado.",
  controle_autonomia:
    "Relacionado à percepção sobre autonomia para decidir como realizar o trabalho e participação nas decisões relacionadas a ele.",
  justica_organizacional:
    "Relacionado à percepção sobre justiça das decisões da direção e aplicação consistente das regras e critérios que afetam os colaboradores.",
  eventos_violentos:
    "Relacionado à percepção sobre medidas de prevenção de situações de violência, ameaça ou agressão relacionadas ao trabalho.",
  baixa_demanda:
    "Relacionado à percepção sobre quantidade insuficiente de atividades e oportunidades para utilizar competências, conhecimentos e habilidades.",
  excesso_demandas:
    "Relacionado à percepção sobre volume e distribuição das atividades, prazos, ritmo de trabalho e pressão para realização das tarefas.",
  relacoes_trabalho:
    "Relacionado à percepção sobre respeito mútuo, colaboração e condução de conflitos na equipe.",
  comunicacao:
    "Relacionado à percepção sobre clareza dos conteúdos e canais de comunicação da organização.",
  trabalho_remoto:
    "Relacionado à percepção sobre oportunidades adequadas de interação e contato com a equipe e liderança, independentemente do modelo de trabalho.",
};

const ANALYSIS_CONTEXT_OPTIONS = [
  "Situação já conhecida pela liderança",
  "Situação relacionada a mudança recente",
  "Situação pontual",
  "Situação recorrente",
  "Já existe ação em andamento",
  "Preciso investigar melhor antes de definir uma ação",
] as const;

const DECISION_OPTIONS = [
  { value: "criar_acao", label: "Criar ação" },
  { value: "acao_existente", label: "Vincular a ação existente" },
  { value: "acompanhar", label: "Acompanhar" },
  { value: "sem_acao", label: "Sem necessidade de ação agora" },
] as const;

function FactorDetailView({
  orgId,
  surveyId,
  factor,
  previous,
  questions,
  analysis: initialAnalysis,
  onBack,
}: {
  orgId: string;
  surveyId: string;
  factor: FactorResult;
  previous: FactorResult | null;
  questions: Tabulation[];
  analysis: FactorAnalysis | null;
  onBack: () => void;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState(initialAnalysis?.text ?? "");
  const [contexts, setContexts] = useState<string[]>(initialAnalysis?.contexts ?? []);
  const [decision, setDecision] = useState<string | null>(initialAnalysis?.decision ?? null);
  const [saved, setSaved] = useState(false);
  const [creatingAction, setCreatingAction] = useState(false);
  const [actionSituation, setActionSituation] = useState("");
  const [actionDescription, setActionDescription] = useState("");
  const [actionResponsible, setActionResponsible] = useState("");
  const [actionDueDate, setActionDueDate] = useState("");
  const [actionFollowUp, setActionFollowUp] = useState("");

  const createLinkedAction = useMutation({
    mutationFn: () => api(`/organization/${orgId}/nr1/actions`, {
      method: "POST",
      body: {
        surveyId,
        factorId: factor.id,
        factorAnalysisId: initialAnalysis?.id ?? null,
        origin: "core_assessment",
        situation: actionSituation,
        description: actionDescription,
        responsibleLabel: actionResponsible || null,
        dueDate: actionDueDate ? new Date(`${actionDueDate}T23:59:59`).toISOString() : null,
        followUpMethod: actionFollowUp || null,
      },
    }),
    onSuccess: () => {
      toast.success("Ação vinculada ao fator e à avaliação.");
      setCreatingAction(false);
      qc.invalidateQueries({ queryKey: ["nr1", "actions", orgId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () =>
      api(`/organization/${orgId}/nr1/surveys/${surveyId}/factor-analysis`, {
        method: "PUT",
        body: {
          factorId: factor.id,
          text: text.trim() || null,
          contexts,
          decision: decision ?? null,
        },
      }),
    onSuccess: () => {
      setSaved(true);
      toast.success("Análise registrada.");
      qc.invalidateQueries({ queryKey: ["nr1", "survey", orgId, surveyId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mandatory = factor.classification === "prioridade";
  const recommended = factor.classification === "atencao";
  const analysisTone = mandatory
    ? "border-rose-300 bg-rose-500/5 dark:border-rose-500/30"
    : recommended
      ? "border-amber-300 bg-amber-500/5 dark:border-amber-500/25"
      : "border-border";
  const analysisTitle = mandatory
    ? "Prioridade — análise obrigatória"
    : recommended
      ? "Atenção — análise recomendada"
      : "Muito favorável — sem análise obrigatória";
  const analysisPrompt = mandatory
    ? "Este fator apresentou um resultado que merece análise prioritária. Registre sua percepção sobre o que pode estar acontecendo na equipe antes de definir uma ação."
    : recommended
      ? "Este fator merece atenção e acompanhamento. Recomendamos registrar sua análise para entender melhor a situação e avaliar se é necessário criar uma ação."
      : "O líder pode consultar o detalhamento e acompanhar o resultado, mas não precisa registrar uma análise obrigatoriamente.";

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
      >
        ← Voltar para a visão geral
      </button>

      <FactorCard factor={factor} previous={previous} />

      <div className="rounded-xl border border-border p-4">
        <h4 className="text-sm font-semibold">O que este fator representa</h4>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          {FACTOR_DESCRIPTIONS[factor.id] ?? ""}
        </p>
      </div>

      <div className="rounded-xl border border-border p-4">
        <h4 className="text-sm font-semibold">O que apareceu na avaliação da sua equipe</h4>
        {questions.length === 0 ? (
          <p className="mt-1 text-xs text-muted-foreground">Sem perguntas vinculadas.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {questions.map((q) => (
              <li key={q.id}>
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-foreground/90">{q.label}</span>
                  <span className="shrink-0 font-semibold">
                    {q.percent != null ? `${q.percent.toFixed(1)}%` : "—"}
                  </span>
                </div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${q.percent != null && q.percent < 50 ? "bg-rose-500" : q.percent != null && q.percent < 75 ? "bg-amber-500" : "bg-emerald-500"}`}
                    style={{ width: `${q.percent ?? 0}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        {questions.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Maior ponto de atenção:{" "}
            {
              [...questions]
                .filter((q) => q.percent != null)
                .sort((a, b) => (a.percent ?? 100) - (b.percent ?? 100))[0]?.label
            }
            .
          </p>
        )}
      </div>

      <div className={`rounded-xl border p-4 ${analysisTone}`}>
        <h4 className="flex items-center gap-2 text-sm font-semibold">
          <TriangleAlert className="h-4 w-4" /> Análise do líder · {analysisTitle}
        </h4>
        <p className="mt-1 text-xs text-muted-foreground">{analysisPrompt}</p>

        <Label className="mt-3 block text-xs">O que você observa na sua equipe em relação a este fator?</Label>
        <Textarea
          rows={3}
          className="mt-1 resize-none"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setSaved(false);
          }}
          placeholder="Registre sua percepção sobre a situação da equipe…"
        />

        <div className="mt-3">
          <Label className="text-xs">Contexto (opcional)</Label>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ANALYSIS_CONTEXT_OPTIONS.map((option) => {
              const active = contexts.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setContexts((prev) =>
                      prev.includes(option) ? prev.filter((c) => c !== option) : [...prev, option],
                    );
                    setSaved(false);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-[11px] transition ${
                    active
                      ? "border-transparent bg-accent-gradient font-semibold text-white"
                      : "border-border bg-background hover:border-accent/50"
                  }`}
                >
                  {option}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-3">
          <Label className="text-xs">Decisão após a análise</Label>
          <Select
            value={decision ?? ""}
            onValueChange={(v) => {
              setDecision(v || null);
              setSaved(false);
            }}
          >
            <SelectTrigger className="mt-1.5">
              <SelectValue placeholder="O que fará com este resultado?" />
            </SelectTrigger>
            <SelectContent>
              {DECISION_OPTIONS.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          {saved && <span className="text-[11px] text-muted-foreground">Análise salva.</span>}
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar análise"}
          </Button>
        </div>
      </div>

      {(decision === "criar_acao" || creatingAction) && (
        <div className="rounded-xl border border-rose-200/70 bg-rose-500/5 p-4 dark:border-rose-500/25">
          <h4 className="text-sm font-semibold">Criar ação para este fator</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            O fator, resultado, classificação e análise ficam vinculados automaticamente.
          </p>
          <div className="mt-3 space-y-3">
            <div><Label className="text-xs">Situação identificada</Label><Input className="mt-1" value={actionSituation} onChange={(e) => setActionSituation(e.target.value)} placeholder={`Ex.: situação relacionada a ${factor.name.toLowerCase()}`} /></div>
            <div><Label className="text-xs">O que será feito?</Label><Textarea className="mt-1 resize-none" rows={3} value={actionDescription} onChange={(e) => setActionDescription(e.target.value)} placeholder="Descreva a medida preventiva." /></div>
            <div className="grid gap-3 sm:grid-cols-3"><div><Label className="text-xs">Responsável</Label><Input className="mt-1" value={actionResponsible} onChange={(e) => setActionResponsible(e.target.value)} placeholder="Nome ou área" /></div><div><Label className="text-xs">Prazo</Label><Input className="mt-1" type="date" value={actionDueDate} onChange={(e) => setActionDueDate(e.target.value)} /></div><div><Label className="text-xs">Acompanhamento</Label><Input className="mt-1" value={actionFollowUp} onChange={(e) => setActionFollowUp(e.target.value)} placeholder="Mensal, indicador…" /></div></div>
            <div className="flex justify-end gap-2"><Button variant="ghost" size="sm" onClick={() => setCreatingAction(false)}>Cancelar</Button><Button size="sm" onClick={() => createLinkedAction.mutate()} disabled={createLinkedAction.isPending || !actionSituation.trim() || !actionDescription.trim()}>{createLinkedAction.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Criar ação"}</Button></div>
          </div>
        </div>
      )}
    </div>
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
