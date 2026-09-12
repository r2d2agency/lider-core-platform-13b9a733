import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/brand/Logo";

/**
 * Public NR-1 anonymous complaint channel — no auth required.
 * URL: /nr1-denuncia/:token
 * Permanent per-organization link (not tied to a specific diagnostic round).
 */

export const Route = createFileRoute("/nr1-denuncia/$token")({
  ssr: false,
  component: PublicComplaintPage,
});

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const CATEGORIES = [
  "Assédio moral",
  "Assédio sexual",
  "Discriminação",
  "Sobrecarga de trabalho",
  "Conflito com liderança",
  "Segurança psicológica",
  "Outro",
];

function PublicComplaintPage() {
  const { token } = Route.useParams();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/api/public/nr1/complaint/${token}`);
        const json = await res.json().catch(() => ({}));
        if (cancel) return;
        if (!res.ok) setError(json.error ?? "Canal não encontrado.");
        else setReady(true);
      } catch {
        if (!cancel) setError("Erro de conexão. Tente novamente.");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [token]);

  async function submit() {
    setSubmitting(true);
    try {
      const res = await fetch(`${API_URL}/api/public/nr1/complaint/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, category: category || null }),
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

  return (
    <Shell>
      {error ? (
        <div className="rounded-3xl border border-border bg-card p-8 text-center shadow-xl">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/10 text-2xl font-bold text-destructive">
            !
          </div>
          <h1 className="mt-4 text-lg font-semibold">{error}</h1>
        </div>
      ) : !ready ? (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground">
          <Loader2 className="h-8 w-8 animate-spin" />
        </div>
      ) : done ? (
        <div className="relative overflow-hidden rounded-3xl border border-border bg-card p-10 text-center shadow-2xl">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-rose-500 text-white shadow-xl ring-8 ring-rose-500/10">
            <CheckCircle2 className="h-10 w-10" />
          </div>
          <h1 className="mt-5 font-display text-3xl">Denúncia enviada</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua denúncia é totalmente anônima e foi enviada apenas aos líderes autorizados da
            organização. Você pode fechar esta página.
          </p>
        </div>
      ) : (
        <>
          <header className="mb-6 rounded-3xl border border-rose-200/60 bg-card p-6 shadow-xl dark:border-rose-500/25 sm:p-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white shadow-md">
              <ShieldAlert className="h-3 w-3" /> Canal de denúncia anônima
            </span>
            <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
              Conte o que aconteceu
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Não pedimos seu nome, e-mail ou qualquer dado que identifique você. Sua denúncia vai
              direto para os líderes autorizados a tratar esse tipo de caso na organização.
            </p>
          </header>

          <div className="space-y-4">
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <label className="text-sm font-semibold">Categoria (opcional)</label>
              <div className="mt-3 flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory((cur) => (cur === c ? "" : c))}
                    className={
                      "rounded-full border px-3 py-1.5 text-xs transition-colors " +
                      (category === c
                        ? "border-rose-500 bg-rose-500 text-white"
                        : "border-border text-muted-foreground hover:border-rose-300")
                    }
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <label className="text-sm font-semibold">O que aconteceu?</label>
              <textarea
                rows={7}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Descreva os fatos com o máximo de detalhes que se sentir confortável em compartilhar..."
                className="mt-3 w-full resize-none rounded-xl border border-input bg-background p-3 text-sm outline-none focus:border-rose-400"
              />
            </div>
          </div>

          <footer className="mt-8 flex flex-col gap-3">
            <button
              onClick={submit}
              disabled={message.trim().length < 5 || submitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-rose-600 px-6 py-3.5 text-base font-semibold text-white shadow-xl transition hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldAlert className="h-4 w-4" />
              )}
              Enviar denúncia anônima
            </button>
            <div className="flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
              <ShieldCheck className="h-3 w-3" /> Nenhum dado que identifique você é coletado.
            </div>
          </footer>
        </>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-rose-500/10 blur-3xl" />
        <div className="absolute right-0 top-40 h-[28rem] w-[28rem] rounded-full bg-rose-500/10 blur-3xl" />
      </div>
      <div className="relative mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <div className="mb-8 flex items-center gap-2.5">
          <Logo variant="mark" className="h-9 w-9 rounded-xl shadow-md" />
          <div>
            <div className="font-display text-base font-bold uppercase leading-none tracking-tight">
              Líder C.O.R.E.
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
              NR-1 · Canal de denúncia
            </div>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
