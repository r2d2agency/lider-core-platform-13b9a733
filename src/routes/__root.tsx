import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  ClientOnly,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
// useRouter still used inside ErrorComponent below

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";

declare global {
  interface Window {
    __liderCoreDomMutationGuardInstalled?: boolean;
    __liderCoreServiceWorkerCleanupDone?: boolean;
    __liderCorePointerEventsGuardInstalled?: boolean;
  }
}

const reportedErrors = new WeakSet<object>();

installDomMutationGuard();

function installDomMutationGuard() {
  if (typeof window === "undefined" || window.__liderCoreDomMutationGuardInstalled) return;

  window.__liderCoreDomMutationGuardInstalled = true;

  const originalRemoveChild = Node.prototype.removeChild;
  const originalInsertBefore = Node.prototype.insertBefore;

  Node.prototype.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (!child || child.parentNode !== this) return child;
    return originalRemoveChild.call(this, child) as T;
  };

  Node.prototype.insertBefore = function <T extends Node>(
    this: Node,
    newNode: T,
    referenceNode: Node | null,
  ): T {
    if (referenceNode && referenceNode.parentNode !== this) {
      return originalInsertBefore.call(this, newNode, null) as T;
    }
    return originalInsertBefore.call(this, newNode, referenceNode) as T;
  };
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    console.error(error);
    if (!reportedErrors.has(error)) {
      reportedErrors.add(error);
      reportLovableError(error, { boundary: "tanstack_root_error_component" });
    }
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  ssr: false,
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "LÍDER C.O.R.E. — Sistema Operacional para Liderança" },
      {
        name: "description",
        content:
          "Plataforma da Neo Pessoas para líderes. Rituais, 1:1s, feedbacks, PDIs e IA que mostra quem precisa da sua atenção hoje.",
      },
      { name: "author", content: "Neo Pessoas" },
      { property: "og:title", content: "LÍDER C.O.R.E." },
      {
        property: "og:description",
        content:
          "O líder não entra no sistema para preencher formulários. Ele entra para liderar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#1a1512" },
      { name: "application-name", content: "Líder C.O.R.E." },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Líder C.O.R.E." },
      { name: "mobile-web-app-capable", content: "yes" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", href: "/favicon.png", type: "image/png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "icon", href: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,400;9..144,500;9..144,600&family=Instrument+Sans:wght@400;500;600&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" translate="no" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (window.__liderCoreDomMutationGuardInstalled) return;
                window.__liderCoreDomMutationGuardInstalled = true;
                var removeChild = Node.prototype.removeChild;
                var insertBefore = Node.prototype.insertBefore;
                Node.prototype.removeChild = function (child) {
                  if (child && child.parentNode !== this) return child;
                  return removeChild.call(this, child);
                };
                Node.prototype.insertBefore = function (node, before) {
                  if (before && before.parentNode !== this) return insertBefore.call(this, node, null);
                  return insertBefore.call(this, node, before);
                };
              })();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (window.__liderCorePointerEventsGuardInstalled) return;
                window.__liderCorePointerEventsGuardInstalled = true;
                function isVisible(el) {
                  if (!el || !el.getBoundingClientRect) return false;
                  var rect = el.getBoundingClientRect();
                  var cs = window.getComputedStyle(el);
                  return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity || '1') > 0.01 && rect.width > 0 && rect.height > 0;
                }
                function clearIfStuck() {
                  var body = document.body;
                  if (!body) return;
                  var openDialogs = Array.prototype.filter.call(
                    document.querySelectorAll('[data-state="open"][role="dialog"], [data-state="open"][role="alertdialog"]'),
                    isVisible
                  );
                  if (openDialogs.length === 0) {
                    body.style.pointerEvents = '';
                    body.removeAttribute('data-scroll-locked');
                    document.querySelectorAll('[data-state="closed"][role="dialog"], [data-state="closed"][role="alertdialog"], [data-state="closed"][data-radix-dialog-overlay]').forEach(function (el) {
                      el.style.pointerEvents = 'none';
                    });
                  }
                }
                function watch() {
                  if (!document.body) { setTimeout(watch, 50); return; }
                  var mo = new MutationObserver(function () { clearIfStuck(); });
                  mo.observe(document.body, { attributes: true, attributeFilter: ['style'] });
                  var mo2 = new MutationObserver(function () { clearIfStuck(); });
                  mo2.observe(document.documentElement, { childList: true, subtree: true });
                  setInterval(clearIfStuck, 500);
                }
                watch();
              })();
            `,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (window.__liderCoreServiceWorkerCleanupDone) return;
                window.__liderCoreServiceWorkerCleanupDone = true;
                var cleanupKey = 'lidercore-sw-cleaned-v5';
                if (navigator.serviceWorker && navigator.serviceWorker.controller && sessionStorage.getItem(cleanupKey) !== '1') {
                  sessionStorage.setItem(cleanupKey, '1');
                  window.location.replace(window.location.href);
                  return;
                }
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(function (regs) {
                    return Promise.all(regs.map(function (reg) { return reg.unregister(); }));
                  }).catch(function () {});
                }
                if ('caches' in window) {
                  caches.keys().then(function (keys) {
                    var liderCoreCaches = keys.filter(function (key) { return key.indexOf('lidercore-') === 0; });
                    return Promise.all(liderCoreCaches.map(function (key) { return caches.delete(key); }));
                  }).catch(function () {});
                }
              })();
            `,
          }}
        />
        <meta name="google" content="notranslate" />
        <HeadContent />
      </head>
      <body className="notranslate" translate="no" suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function BootSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
        <span className="text-xs uppercase tracking-widest text-muted-foreground">
          Carregando LÍDER C.O.R.E.
        </span>
      </div>
    </div>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <ClientOnly fallback={<BootSplash />}>
        <AuthProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster />
        </AuthProvider>
      </ClientOnly>
    </QueryClientProvider>
  );
}


