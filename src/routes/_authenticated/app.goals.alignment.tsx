import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Loader2, Link2, AlertTriangle, SearchX, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { useCurrentOrg } from "@/lib/use-current-org";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/app/goals/alignment")({
  component: GoalAlignmentPage,
  head: () => ({
    meta: [
      { title: "Alinhamento de metas — LíderCore" },
      { name: "description", content: "Confronto lado a lado: metas corporativas × metas do ciclo, órfãs e descobertas." },
    ],
  }),
});

type IndicatorRef = { id: string; name: string; unit: string | null };
type CorpGoal = { id: string; title: string; indicatorId: string | null; indicator: IndicatorRef | null; targetValue: number | null; currentValue: number | null; dueAt: string | null };
type CycGoal = CorpGoal & { ownerUserId: string | null; ownerName: string | null; status: string };
type Pair = { corporateGoalId: string; cycleGoalId: string; reason: string };
type Simple = { id: string; title: string };
type Ai = { pairs: Array<{ corporateGoalId: string; cycleGoalId: string; why: string }>; orphanAdvice: string[]; gapAdvice: string[] } | null;
type Align = {
  cycle: { id: string; name: string; startAt: string; endAt: string; status: string };
  briefingStatus: string | null;
  corporateGoals: CorpGoal[];
  cycleGoals: CycGoal[];
  pairs: Pair[];
  orphans: Simple[];
  discoveries: Simple[];
  ai: Ai;
};
type Cycle = { id: string; name: string };
type Current = { cycleId: string | null; cycles: Cycle[] };

function GoalAlignmentPage() {
  const { orgId } = useCurrentOrg();
  const [cycleId, setCycleId] = useState<string | null>(null);

  const { data: current } = useQuery<Current>({
    queryKey: ["corp-cycles", orgId],
    enabled: !!orgId,
    queryFn: () => api<Current>(`/organization/${orgId}/corporate-briefings/current`),
  });

  const effective = cycleId ?? current?.cycleId ?? null;

  const { data, isLoading } = useQuery<Align>({
    queryKey: ["goal-alignment", orgId, effective],
    enabled: !!orgId && !!effective,
    queryFn: () => api<Align>(`/organization/${orgId}/goal-alignment?cycleId=${effective}`),
  });

  if (!orgId) return <div className="p-6 text-sm text-muted-foreground">Selecione uma organização.</div>;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Alinhamento de metas</h1>
          <p className="text-sm text-muted-foreground">Meta corporativa × metas do ciclo que a atendem.</p>
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

      {isLoading && <div className="flex items-center gap-2 p-6"><Loader2 className="h-4 w-4 animate-spin" />Analisando alinhamento…</div>}

      {data && (
        <>
          {data.ai && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4" />Sugestões da IA</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                {data.ai.pairs.map((p, i) => {
                  const cg = data.corporateGoals.find((g) => g.id === p.corporateGoalId);
                  const lg = data.cycleGoals.find((g) => g.id === p.cycleGoalId);
                  return <div key={i} className="border-l-2 pl-3"><Link2 className="inline h-3 w-3 mr-1" />“{lg?.title ?? p.cycleGoalId}” atende “{cg?.title ?? p.corporateGoalId}” — {p.why}</div>;
                })}
                {data.ai.orphanAdvice.map((t, i) => <div key={`o${i}`} className="text-muted-foreground">Órfã: {t}</div>)}
                {data.ai.gapAdvice.map((t, i) => <div key={`g${i}`} className="text-muted-foreground">Gap: {t}</div>)}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Corporativas ({data.corporateGoals.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.corporateGoals.map((g) => {
                  const covered = data.pairs.some((p) => p.corporateGoalId === g.id);
                  const isDiscovery = data.discoveries.some((d) => d.id === g.id);
                  return (
                    <div key={g.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm">{g.title}</div>
                        {isDiscovery
                          ? <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300">descoberta</Badge>
                          : covered
                            ? <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">atendida</Badge>
                            : <Badge variant="secondary">sem pareamento</Badge>}
                      </div>
                      {g.indicator && <div className="text-xs text-muted-foreground mt-1">{g.indicator.name}</div>}
                      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                        {data.pairs.filter((p) => p.corporateGoalId === g.id).map((p) => {
                          const lg = data.cycleGoals.find((x) => x.id === p.cycleGoalId);
                          return <div key={p.cycleGoalId}>← {lg?.title ?? p.cycleGoalId} ({p.reason})</div>;
                        })}
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Metas do ciclo ({data.cycleGoals.length})</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data.cycleGoals.map((g) => {
                  const isOrphan = data.orphans.some((o) => o.id === g.id);
                  return (
                    <div key={g.id} className="rounded-lg border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium text-sm">{g.title}</div>
                        {isOrphan
                          ? <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300">órfã</Badge>
                          : <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">alinhada</Badge>}
                      </div>
                      {g.ownerName && <div className="text-xs text-muted-foreground mt-1">{g.ownerName}</div>}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>

          {(data.orphans.length > 0 || data.discoveries.length > 0) && (
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4" />Pontos de atenção</CardTitle></CardHeader>
              <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
                <div>
                  <div className="font-medium flex items-center gap-1"><SearchX className="h-3 w-3" />Órfãs ({data.orphans.length})</div>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {data.orphans.map((o) => <li key={o.id}>{o.title}</li>)}
                  </ul>
                </div>
                <div>
                  <div className="font-medium">Descobertas ({data.discoveries.length})</div>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                    {data.discoveries.map((d) => <li key={d.id}>{d.title}</li>)}
                  </ul>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
