import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Loader2, Send, Undo2 } from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/lib/use-current-org";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

export const Route = createFileRoute("/_authenticated/app/goals/analysis/$id")({
  component: GoalAnalysisDetailPage,
  head: () => ({
    meta: [
      { title: "Análise de metas — LíderCore" },
      { name: "description", content: "Análise do líder para alinhamento com metas da corporação." },
    ],
  }),
});

type IndicatorRef = { id: string; name: string; unit: string | null };
type CorpGoal = { id: string; title: string; indicator: IndicatorRef | null; targetValue: number | null };
type AnalysisItem = {
  id: string;
  corporateGoalId: string;
  contribution: string;
  linkedCycleGoalIds: string[];
  gap: string | null;
  orderIndex: number;
  corporateGoal: CorpGoal;
};
type Analysis = {
  id: string;
  organizationId: string;
  cycleId: string;
  authorUserId: string;
  reviewerUserId: string | null;
  status: "draft" | "submitted" | "returned" | "approved";
  reviewComment: string | null;
  submittedAt: string | null;
  reviewedAt: string | null;
  items: AnalysisItem[];
  cycle: { id: string; name: string; startAt: string; endAt: string; status: string } | null;
  userNames: Record<string, string>;
};

const STATUS_META: Record<Analysis["status"], { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-secondary text-foreground" },
  submitted: { label: "Enviada", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  returned: { label: "Devolvida", cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  approved: { label: "Aprovada", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};

function GoalAnalysisDetailPage() {
  const { orgId } = useCurrentOrg();
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [reviewComment, setReviewComment] = useState("");

  const { data: analysis, isLoading } = useQuery<Analysis>({
    queryKey: ["goal-analysis", orgId, id],
    enabled: !!orgId && !!id,
    queryFn: () => api<Analysis>(`/organization/${orgId}/goal-analyses/${id}`),
  });

  const submit = useMutation({
    mutationFn: () => api(`/organization/${orgId}/goal-analyses/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Análise enviada para revisão");
      qc.invalidateQueries({ queryKey: ["goal-analysis", orgId, id] });
      qc.invalidateQueries({ queryKey: ["goal-analyses"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao enviar"),
  });

  const review = useMutation({
    mutationFn: (action: "approve" | "return") =>
      api(`/organization/${orgId}/goal-analyses/${id}/review`, { method: "POST", body: { action, reviewComment } }),
    onSuccess: (_, action) => {
      toast.success(action === "approve" ? "Análise aprovada" : "Análise devolvida");
      qc.invalidateQueries({ queryKey: ["goal-analysis", orgId, id] });
      qc.invalidateQueries({ queryKey: ["goal-analyses"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao revisar"),
  });

  if (!orgId) return <div className="p-6 text-sm text-muted-foreground">Selecione uma organização.</div>;
  if (isLoading) return <div className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" />Carregando análise…</div>;
  if (!analysis) return <div className="p-6 text-sm text-muted-foreground">Análise não encontrada.</div>;

  const isAuthor = true; // UI simplificada; permissões validadas no backend
  const canReview = analysis.status === "submitted";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/app/goals/corporate" })}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Análise de metas</h1>
            <p className="text-sm text-muted-foreground">
              Ciclo {analysis.cycle?.name ?? ""} · Autor: {analysis.userNames[analysis.authorUserId] ?? analysis.authorUserId}
              {analysis.reviewerUserId && <> · Revisor: {analysis.userNames[analysis.reviewerUserId] ?? analysis.reviewerUserId}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={STATUS_META[analysis.status].cls}>{STATUS_META[analysis.status].label}</Badge>
          {analysis.status === "draft" || analysis.status === "returned" ? (
            <Button onClick={() => submit.mutate()} disabled={submit.isPending}>
              {submit.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Enviar para revisão
            </Button>
          ) : null}
        </div>
      </div>

      {analysis.reviewComment && (
        <Card>
          <CardHeader><CardTitle className="text-base">Comentário do revisor</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-line">{analysis.reviewComment}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-base">Itens por meta corporativa ({analysis.items.length})</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {analysis.items.map((item) => (
            <div key={item.id} className="rounded-lg border p-3 space-y-2">
              <div className="font-medium">{item.corporateGoal.title}</div>
              {item.corporateGoal.indicator && (
                <div className="text-xs text-muted-foreground">Indicador: {item.corporateGoal.indicator.name}</div>
              )}
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">Como minha equipe contribui</div>
                <div className="mt-1 text-sm whitespace-pre-line">{item.contribution}</div>
              </div>
              {item.gap && (
                <div>
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Conflito / Gap</div>
                  <div className="mt-1 text-sm whitespace-pre-line">{item.gap}</div>
                </div>
              )}
              <div className="text-xs text-muted-foreground">
                Metas de ciclo vinculadas: {item.linkedCycleGoalIds.length}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {canReview && (
        <Card>
          <CardHeader><CardTitle className="text-base">Revisar análise</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              placeholder="Comentário (obrigatório ao devolver)"
              value={reviewComment}
              onChange={(e) => setReviewComment(e.target.value)}
            />
            <div className="flex gap-2">
              <Button onClick={() => review.mutate("approve")} disabled={review.isPending}>
                <CheckCircle2 className="mr-2 h-4 w-4" /> Aprovar
              </Button>
              <Button variant="outline" onClick={() => review.mutate("return")} disabled={review.isPending || !reviewComment.trim()}>
                <Undo2 className="mr-2 h-4 w-4" /> Devolver
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
