import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Send, FileText, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/lib/use-current-org";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_authenticated/app/goals/analysis")({
  component: GoalAnalysisPage,
  head: () => ({
    meta: [
      { title: "Minha análise de metas — LíderCore" },
      { name: "description", content: "Análise do líder para metas por ciclo." },
    ],
  }),
});

type CorpGoal = { id: string; title: string; indicatorId: string | null };
type Briefing = {
  id: string;
  cycleId: string;
  status: string;
  goals: CorpGoal[];
};
type CurrentResponse = { cycleId: string | null; cycles: { id: string; name: string }[]; briefing: Briefing | null };
type CycleGoal = { id: string; title: string };
type AnalysisItem = {
  id?: string;
  corporateGoalId: string;
  contribution: string;
  linkedCycleGoalIds: string[];
  gap?: string | null;
  orderIndex?: number;
  corporateGoal?: { title: string };
};
type Analysis = {
  id: string;
  status: string;
  cycle: { name: string } | null;
  submittedAt: string | null;
  items: AnalysisItem[];
  reviewComment?: string | null;
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-secondary text-foreground" },
  submitted: { label: "Enviada", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  returned: { label: "Devolvida", cls: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  approved: { label: "Aprovada", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};

function GoalAnalysisPage() {
  const { orgId } = useCurrentOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState<string | null>(null);

  const { data: current, isLoading } = useQuery<CurrentResponse>({
    queryKey: ["corp-cycles", orgId],
    enabled: !!orgId,
    queryFn: () => api<CurrentResponse>(`/organization/${orgId}/corporate-briefings/current`),
  });

  const effective = cycleId ?? current?.cycleId ?? null;
  const briefing = current?.briefing ?? null;

  const { data: cycleGoals } = useQuery<CycleGoal[]>({
    queryKey: ["cycle-goals-step3", orgId, effective],
    enabled: !!orgId && !!effective,
    queryFn: () => api<CycleGoal[]>(`/organization/${orgId}/cycles/${effective}/goals`),
  });

  const { data: myAnalyses, isLoading: loadingAnalyses } = useQuery<Analysis[]>({
    queryKey: ["goal-analyses", orgId, effective],
    enabled: !!orgId && !!effective,
    queryFn: () => api<Analysis[]>(`/organization/${orgId}/goal-analyses?cycleId=${effective}`),
  });

  const [items, setItems] = useState<Record<string, { contribution: string; gap: string; linked: string[] }>>({});
  const [reviewerUserId, setReviewerUserId] = useState("");

  const create = useMutation({
    mutationFn: () =>
      api(`/organization/${orgId}/goal-analyses`, {
        method: "POST",
        body: {
          cycleId: effective,
          reviewerUserId: reviewerUserId || undefined,
          items: (briefing?.goals ?? []).map((g, idx) => ({
            corporateGoalId: g.id,
            contribution: items[g.id]?.contribution ?? "",
            linkedCycleGoalIds: items[g.id]?.linked ?? [],
            gap: items[g.id]?.gap || null,
            orderIndex: idx,
          })),
        },
      }),
    onSuccess: (data: any) => {
      toast.success("Análise salva como rascunho");
      qc.invalidateQueries({ queryKey: ["goal-analyses"] });
      setItems({});
      navigate({ to: "/app/goals/analysis/$id", params: { id: data.id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar análise"),
  });

  const submit = useMutation({
    mutationFn: (id: string) => api(`/organization/${orgId}/goal-analyses/${id}/submit`, { method: "POST" }),
    onSuccess: () => {
      toast.success("Análise enviada para revisão");
      qc.invalidateQueries({ queryKey: ["goal-analyses"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao enviar"),
  });

  if (!orgId) return <div className="p-6 text-sm text-muted-foreground">Selecione uma organização.</div>;
  if (isLoading || loadingAnalyses) return <div className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Minha análise de metas</h1>
          <p className="text-sm text-muted-foreground">Como minha equipe atende às metas da corporação.</p>
        </div>
        <Select value={effective ?? ""} onValueChange={setCycleId}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Selecione um ciclo" /></SelectTrigger>
          <SelectContent>
            {(current?.cycles ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {myAnalyses && myAnalyses.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Minhas análises</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {myAnalyses.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                <div>
                  <div className="font-medium text-sm">Ciclo {a.cycle?.name ?? ""}</div>
                  <div className="text-xs text-muted-foreground">{a.items.length} itens</div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={STATUS_META[a.status]?.cls}>{STATUS_META[a.status]?.label ?? a.status}</Badge>
                  <Button variant="outline" size="sm" onClick={() => navigate({ to: "/app/goals/analysis/$id", params: { id: a.id } })}>
                    <FileText className="mr-1 h-3 w-3" /> Abrir
                  </Button>
                  {(a.status === "draft" || a.status === "returned") && (
                    <Button size="sm" onClick={() => submit.mutate(a.id)} disabled={submit.isPending}>
                      <Send className="mr-1 h-3 w-3" /> Enviar
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!briefing ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Sem briefing para este ciclo ainda.</CardContent></Card>
      ) : (
        <Card>
          <CardHeader><CardTitle className="text-base">Nova análise — {briefing.goals.length} metas corporativas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {briefing.goals.map((g) => {
              const st = items[g.id] ?? { contribution: "", gap: "", linked: [] };
              return (
                <div key={g.id} className="rounded-lg border p-3 space-y-3">
                  <div className="font-medium text-sm">{g.title}</div>
                  <div>
                    <Label>Como minha equipe contribui</Label>
                    <Textarea
                      placeholder="Descreva como sua equipe contribui para esta meta"
                      value={st.contribution}
                      onChange={(e) => setItems((p) => ({ ...p, [g.id]: { ...st, contribution: e.target.value } }))}
                    />
                  </div>
                  <div>
                    <Label>Metas de ciclo que atendem</Label>
                    <div className="mt-1 space-y-1">
                      {(cycleGoals ?? []).map((cg) => (
                        <label key={cg.id} className="flex items-center gap-2 text-sm">
                          <Checkbox
                            checked={st.linked.includes(cg.id)}
                            onCheckedChange={(checked) =>
                              setItems((p) => ({
                                ...p,
                                [g.id]: {
                                  ...st,
                                  linked: checked ? [...st.linked, cg.id] : st.linked.filter((x) => x !== cg.id),
                                },
                              }))
                            }
                          />
                          {cg.title}
                        </label>
                      ))}
                      {(!cycleGoals || cycleGoals.length === 0) && (
                        <div className="text-xs text-muted-foreground">Nenhuma meta de ciclo encontrada.</div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label>Conflito / Gap (opcional)</Label>
                    <Textarea
                      placeholder="Onde você vê conflito ou gap?"
                      value={st.gap}
                      onChange={(e) => setItems((p) => ({ ...p, [g.id]: { ...st, gap: e.target.value } }))}
                    />
                  </div>
                </div>
              );
            })}
            <div className="flex items-center gap-2">
              <Button onClick={() => create.mutate()} disabled={create.isPending || (briefing.goals.some((g) => !(items[g.id]?.contribution ?? "").trim()))}>
                {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Salvar rascunho
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
