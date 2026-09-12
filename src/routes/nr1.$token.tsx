import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

/**
 * Public NR-1 diagnostic page — no auth required, fully anonymous.
 * URL: /nr1/:token
 */

export const Route = createFileRoute("/nr1/$token")({
  ssr: false,
  component: PublicNR1Page,
});

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

type Question = { id: string; label: string };
type Payload = { title: string; questions: Question[] };

function PublicNR1Page() {
  const { token } = Route.useParams();
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/public/nr1/survey/${token}`);
        const json = await res.json();
        if (cancel) return;
        if (!res.ok) setError(json.error ?? "Não foi possível abrir o diagnóstico.");
        else setData(json as Payload);
      } catch {
        if (!cancel) setError("Erro de conexão. Tente novamente.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [token]);

  const questions = data?.questions ?? [];
  const allAnswered = questions.every((q) => typeof answers[q.id] === "number");

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/public/nr1/survey/${token}/answer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Falha ao enviar.");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao enviar.");
    } finally {
      setSubmitting(false);
    }
  }

  if (error) {
    return (
      <Shell>
        <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-2xl font-bold text-destructive">
            !
          </div>
          <h1 className="mt-4 text-lg font-semibold">{error}</h1>
        </div>
      </Shell>
    );
  }

  if (!data) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
          <span className="text-sm font-medium">Carregando…</span>
        </div>
      </Shell>
    );
  }

  if (done) {
    return (
      <Shell>
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-10 text-center shadow-2xl">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-accent-gradient text-white shadow-xl ring-8 ring-accent/10">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h1 className="mt-5 font-display text-3xl">Obrigado!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua resposta é totalmente anônima e já foi registrada. Você pode fechar esta página.
          </p>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <header className="mb-6 rounded-3xl border border-border bg-card p-6 shadow-xl sm:p-8">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-gradient px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-md">
          <Sparkles className="h-3 w-3" /> NR-1 · Diagnóstico
        </span>
        <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">{data.title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Suas respostas são 100% anônimas — nada aqui identifica você. Avalie de 1 (discordo
          totalmente) a 5 (concordo totalmente).
        </p>
      </header>

      <div className="space-y-4">
        {questions.map((q) => {
          const val = answers[q.id];
          return (
            <div key={q.id} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <label className="text-sm font-semibold">{q.label}</label>
              <div className="mt-4 flex items-center justify-between gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setAnswers((s) => ({ ...s, [q.id]: n }))}
                    className={
                      "h-14 flex-1 rounded-xl border text-base font-bold transition-all " +
                      (val === n
                        ? "scale-110 border-transparent bg-accent-gradient text-white shadow-lg shadow-accent/40"
                        : "border-border bg-background hover:border-accent/50 hover:bg-accent/5")
                    }
                  >
                    {n}
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-between text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                <span>Discordo totalmente</span>
                <span>Concordo totalmente</span>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="mt-8 flex flex-col gap-3">
        <button
          onClick={submit}
          disabled={!allAnswered || submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent-gradient px-6 py-3.5 text-base font-semibold text-white shadow-xl transition hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          Enviar respostas
        </button>
        <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3 w-3" /> Resposta anônima — ninguém saberá quem respondeu o
          quê.
        </div>
      </footer>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="absolute right-0 top-40 h-[28rem] w-[28rem] rounded-full bg-accent/15 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo variant="mark" className="h-9 w-9 rounded-xl shadow-md" />
          <div>
            <div className="font-display text-base font-bold uppercase leading-none tracking-tight">
              Líder C.O.R.E.
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              NR-1 · Riscos psicossociais
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
