import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { applyUpdate, useAppUpdate } from "@/lib/use-app-update";

// ---------------------------------------------------------------
// Aviso de nova versão disponível.
//
// O app não usa service worker (o cache antigo servia HTML velho junto
// com bundle novo e quebrava o login — ver public/sw.js). Em vez disso,
// `useAppUpdate` compara o <meta name="app-build"> deste build com o
// do HTML servido pelo servidor. Quando diverge, este banner aparece
// com o botão "Atualizar agora", que limpa caches residuais e recarrega.
// ---------------------------------------------------------------

export function UpdateBanner() {
  const { updateAvailable } = useAppUpdate();
  const [dismissed, setDismissed] = useState(false);

  // Se o usuário dispensar, só mostramos de novo na próxima sessão —
  // senão o banner ficaria grudado depois do reload.
  useEffect(() => {
    if (!updateAvailable) setDismissed(false);
  }, [updateAvailable]);

  if (!updateAvailable || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-[90] flex justify-center p-3 sm:p-4"
    >
      <div className="flex w-full max-w-lg items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg sm:p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Download className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground">Nova versão disponível</p>
          <p className="truncate text-xs text-muted-foreground">
            Atualize para ter as últimas correções e recursos.
          </p>
        </div>
        <Button size="sm" onClick={() => void applyUpdate()}>
          Atualizar agora
        </Button>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Dispensar aviso de atualização"
          onClick={() => setDismissed(true)}
        >
          <X />
        </Button>
      </div>
    </div>
  );
}
