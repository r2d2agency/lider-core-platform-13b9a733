import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Target, Calendar, CheckCircle2, Clock } from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/lib/use-current-org";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/goals/corporate")({
  component: CorporateGoalsPage,
  head: () => ({
    meta: [
      { title: "Metas da Corporação — LíderCore" },
      { name: "description", content: "Briefing oficial do dono para o ciclo: contexto, prioridades, restrições e metas corporativas." },
    ],
  }),
});

type Indicator = { id: string; name: string; unit: string | null; direction: string; target: number | null };
type CorporateGoal = {
  id: string;
  title: string;
  indicatorId: string | null;
  targetValue: number | null;
  currentValue: number | null;
  dueAt: string | null;
  indicator: Indicator | null;
};
type Revision = { at: string; by: string; note: string | null; snapshot: unknown };
type Briefing = {
  id: string;
  cycleId: string;
  context: string | null;
  priorities: string[];
  constraints: string[];
  status: "draft" | "published" | "ratified";
  revisions: Revision[];
  goals: CorporateGoal[];
  userNames: Record<string, string>;
  cycle?: { id: string; name: string; startAt: string; endAt: string; status: string };
};
type Cycle = { id: string; name: string; startAt: string; endAt: string; status: string };
type CurrentResponse = { cycleId: string | null; cycles: Cycle[]; briefing: Briefing | null };

const STATUS_META: Record<Briefing["status"], { label: string; cls: string }> = {
  draft: { label: "Rascunho", cls: "bg-secondary text-foreground" },
  published: { label: "Publicado", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  ratified: { label: "Oficial", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
};

function fmt(v: number | null, unit: string | null) {
  if (v == null) return "—";
  return `${v}${unit ? ` ${unit}` : ""}`;
}

function CorporateGoalsPage() {
  const { orgId } = useCurrentOrg();
  const qc = useQueryClient();
  const [cycleId, setCycleId] = useState<string | null>(null);

  const { data, isLoading } = useQuery<CurrentResponse>({
    queryKey: ["corporate-briefing", orgId, cycleId],
    enabled: !!orgId,
    queryFn: () => api<CurrentResponse>(`/organization/${orgId}/corporate-briefings/current${cycleId ? `?cycleId=${cycleId}` : ""}`),
  });

  const effectiveCycleId = cycleId ?? data?.cycleId ?? null;

  if (!orgId) return <div className="p-6 text-sm text-muted-foreground">Selecione uma organização.</div>;
  if (isLoading) return <div className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>;

  const briefing = data?.briefing ?? null;
  const cycles = data?.cycles ?? [];

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Metas da Corporação</h1>
          <p className="text-sm text-muted-foreground">Briefing oficial do dono para o ciclo selecionado.</p>
        </div>
        <Select value={effectiveCycleId ?? ""} onValueChange={(v) => setCycleId(v)}>
          <SelectTrigger className="w-64"><SelectValue placeholder="Selecione um ciclo" /></SelectTrigger>
          <SelectContent>
            {cycles.map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!briefing ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Nenhum briefing publicado para este ciclo ainda.</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{briefing.cycle?.name ?? "Ciclo"}</CardTitle>
              <Badge className={STATUS_META[briefing.status].cls}>{STATUS_META[briefing.status].label}</Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              {briefing.context && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Contexto</h3>
                  <p className="mt-1 text-sm whitespace-pre-line">{briefing.context}</p>
                </div>
              )}
              {briefing.priorities.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Prioridades</h3>
                  <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
                    {briefing.priorities.map((p, i) => <li key={i}>{p}</li>)}
                  </ul>
                </div>
              )}
              {briefing.constraints.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold uppercase text-muted-foreground">Restrições</h3>
                  <ul className="mt-1 list-disc pl-5 text-sm space-y-1">
                    {briefing.constraints.map((c, i) => <li key={i}>{c}</li>)}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Metas corporativas ({briefing.goals.length})</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {briefing.goals.map((g, i) => (
                <div key={g.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <Target className="mt-0.5 h-4 w-4 text-primary" />
                      <div>
                        <div className="font-medium">{i + 1}. {g.title}</div>
                        {g.indicator && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            Indicador: {g.indicator.name} ({fmt(g.indicator.target, g.indicator.unit)})
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="text-right text-xs">
                      <div>Alvo: <strong>{fmt(g.targetValue, g.indicator?.unit ?? null)}</strong></div>
                      <div>Atual: {fmt(g.currentValue, g.indicator?.unit ?? null)}</div>
                      {g.dueAt && <div className="text-muted-foreground mt-1"><Clock className="inline h-3 w-3" /> {new Date(g.dueAt).toLocaleDateString("pt-BR")}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {briefing.revisions.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="text-base">Histórico de revisões ({briefing.revisions.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {briefing.revisions.slice().reverse().map((r, i) => (
                  <div key={i} className="text-sm border-l-2 pl-3">
                    <div className="font-medium">{new Date(r.at).toLocaleString("pt-BR")} · {briefing.userNames[r.by] ?? r.by}</div>
                    {r.note && <div className="text-muted-foreground">{r.note}</div>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
