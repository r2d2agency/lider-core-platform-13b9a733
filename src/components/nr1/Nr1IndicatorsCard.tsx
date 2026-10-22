import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Minus, RefreshCw, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";

/**
 * Indicadores do NR-1 dentro da tela de Indicadores (Módulo R).
 *
 * O diagnóstico de riscos psicossociais produz 13 fatores com percentual
 * convertido. Aqui eles aparecem como indicadores com meta, farol e
 * comparação com a rodada anterior — o mesmo painel que a organização já
 * usa para resultado, área e liderança.
 */

export type Nr1FactorIndicator = {
  id: string;
  name: string;
  percent: number | null;
  previousPercent: number | null;
  delta: number | null;
  average: number | null;
  respondentCount: number;
  classification: "muito_favoravel" | "atencao" | "prioridade" | null;
};

export type Nr1Snapshot = {
  survey: { id: string; title: string; teamId: string | null; createdAt: string } | null;
  previousSurvey: { id: string; title: string; createdAt: string } | null;
  factors: Nr1FactorIndicator[];
  insufficientCount: number;
};

const META = 75;

function fmt(n: number) {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

function bandStyle(f: Nr1FactorIndicator) {
  if (f.percent == null) return "border-border";
  if (f.percent >= META) return "border-success/40 bg-success/5";
  if (f.percent >= 50) return "border-warning/40 bg-warning/5";
  return "border-destructive/40 bg-destructive/5";
}

function bandLabel(f: Nr1FactorIndicator) {
  if (f.percent == null) return "Sem dados";
  if (f.percent >= META) return "Favorável";
  if (f.percent >= 50) return "Atenção";
  return "Prioridade";
}

export function Nr1IndicatorsCard({
  orgId,
  data,
  isLoading,
  isError,
}: {
  orgId: string;
  data: Nr1Snapshot | undefined;
  isLoading: boolean;
  isError: boolean;
}) {
  const qc = useQueryClient();
  const sync = useMutation({
    mutationFn: () => api(`/organization/${orgId}/nr1/indicators/sync`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indicators", orgId] });
      qc.invalidateQueries({ queryKey: ["nr1", "indicators", orgId] });
      toast.success("Indicadores do NR-1 sincronizados");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (isLoading) return null;
  // O módulo NR-1 pode não estar habilitado para este usuário: nesse caso a
  // rota responde 403 e o painel simplesmente não aparece.
  if (isError || !data?.survey) return null;

  const factors = data.factors;
  const atencao = factors.filter((f) => f.classification === "atencao").length;
  const prioridade = factors.filter((f) => f.classification === "prioridade").length;

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" style={{ color: "var(--pilar-r)" }} /> NR-1 ·
            Riscos psicossociais
          </div>
          <h2 className="mt-1 font-display text-xl">Indicadores do diagnóstico</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Rodada de referência:{" "}
            <strong className="font-semibold text-foreground">{data.survey.title}</strong>
            {data.previousSurvey && (
              <>
                {" "}
                · comparação com{" "}
                <strong className="font-semibold text-foreground">
                  {data.previousSurvey.title}
                </strong>
              </>
            )}
            . Meta: {META}% (faixa favorável do NR-1).
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {atencao} fator(es) em atenção · {prioridade} fator(es) em prioridade.
            {data.insufficientCount > 0 && (
              <> {data.insufficientCount} rodada(s) sem resultado por anonimato.</>
            )}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          disabled={sync.isPending}
          onClick={() => sync.mutate()}
        >
          <RefreshCw className={sync.isPending ? "h-3.5 w-3.5 animate-spin" : "h-3.5 w-3.5"} />
          Sincronizar com Indicadores
        </Button>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-2">
        {factors.map((f) => (
          <div key={f.id} className={"rounded-xl border p-3 " + bandStyle(f)}>
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium leading-snug">{f.name}</span>
              <span className="shrink-0 text-[10px] uppercase tracking-widest text-muted-foreground">
                {bandLabel(f)}
              </span>
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="font-display text-2xl tabular-nums">
                {f.percent == null ? "—" : `${fmt(f.percent)}%`}
              </span>
              {f.delta != null && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {f.delta > 0 ? (
                    <ArrowUp className="h-3.5 w-3.5" />
                  ) : f.delta < 0 ? (
                    <ArrowDown className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                  {fmt(Math.abs(f.delta))} p.p.
                </span>
              )}
            </div>
            {f.previousPercent != null && (
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                Rodada anterior: {fmt(f.previousPercent)}%
              </div>
            )}
          </div>
        ))}
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground">
        O diagnóstico NR-1 é um instrumento de gestão de riscos e não substitui o PGR/SST nem a
        avaliação de impacto do trabalho. Fatores em prioridade exigem plano de ação com responsável
        e prazo.
      </p>
    </div>
  );
}
