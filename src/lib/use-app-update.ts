import { useCallback, useEffect, useRef, useState } from "react";

// ---------------------------------------------------------------
// Detecção de nova versão do app — SEM service worker.
//
// O service worker ficou desativado porque o cache podia servir
// HTML antigo junto com bundle novo e quebrar o login (React #418).
// Sem SW o navegador sempre busca o HTML da rede (a resposta sai
// com `no-store` em `src/server.ts`), então comparar o build
// declarado no <meta name="app-build"> é suficiente: o valor é
// gerado em cada build (ver `vite.config.ts`) e o `fetch` abaixo
// é feito com `cache: "no-store"` para não ler do cache do HTTP.
//
// A verificação roda a cada POLL_MS e sempre que a aba volta a
// ficar visível — no mobile é esse segundo caminho que importa,
// já que o app fica aberto por dias em segundo plano.
// ---------------------------------------------------------------

const POLL_MS = 15 * 60 * 1000;
const BUILD_META_NAME = "app-build";

/** Build atual, lido do <meta> que o SSR embutiu no HTML. */
function currentBuild(): string | null {
  return document.querySelector(`meta[name="${BUILD_META_NAME}"]`)?.getAttribute("content") ?? null;
}

/** Alguns assets antigos vêm de um prefixo próprio — removemos só esses. */
async function clearStaleCaches(): Promise<void> {
  if (!("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith("lidercore-")).map((k) => caches.delete(k)));
  } catch {
    // melhor esforço: o reload já resolve o essencial
  }
}

/** Recarrega a aplicação na versão nova do servidor. */
export async function applyUpdate(): Promise<void> {
  await clearStaleCaches();
  window.location.reload();
}

export function useAppUpdate() {
  const initialBuild = useRef<string | null>(null);
  const [latestBuild, setLatestBuild] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<number | null>(null);

  const check = useCallback(async (): Promise<boolean> => {
    if (initialBuild.current === null) initialBuild.current = currentBuild();
    setChecking(true);
    try {
      const res = await fetch(window.location.href, { cache: "no-store" });
      const html = await res.text();
      const match = html.match(new RegExp(`<meta name="${BUILD_META_NAME}" content="([^"]+)"`));
      const remoteBuild = match?.[1] ?? null;
      setLastCheckedAt(Date.now());
      if (remoteBuild && initialBuild.current && remoteBuild !== initialBuild.current) {
        setLatestBuild(remoteBuild);
        return true;
      }
      setLatestBuild(null);
      return false;
    } catch {
      // Sem rede ou resposta ilegível: segue com a versão atual.
      return false;
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    initialBuild.current = currentBuild();
    void check();
    const id = window.setInterval(() => void check(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [check]);

  return {
    updateAvailable: latestBuild !== null && latestBuild !== initialBuild.current,
    checking,
    lastCheckedAt,
    check,
  };
}
