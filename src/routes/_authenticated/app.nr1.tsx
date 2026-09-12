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
    <div className="mx-auto max-w-5xl space-y-8">
      <div>
        <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <ShieldAlert className="h-3.5 w-3.5 text-rose-600" /> NR-1
        </div>
        <h1 className="mt-2 font-display text-3xl sm:text-4xl">Riscos psicossociais</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Diagnóstico anônimo por link/QR, sem necessidade de login, com tabulação automática por
          equipe — e um canal permanente de denúncia anônima, sem identificação do denunciante.
        </p>
      </div>

      <SurveysSection orgId={orgId} />
      <ComplaintChannelSection orgId={orgId} />
      <ComplaintsSection orgId={orgId} />
    </div>
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

        <div>
          <Label>Plano de ação de melhoria</Label>
          <Textarea
            rows={3}
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
