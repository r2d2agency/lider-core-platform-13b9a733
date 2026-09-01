// Service worker desativado temporariamente.
// Motivo: o cache anterior podia servir HTML antigo com bundle novo e quebrar
// o login com React #418 (hydration mismatch). Mantemos este arquivo apenas
// para remover workers/caches antigos nos navegadores já instalados.

const QUEUE_STORE = "mutations";

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(Promise.resolve());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))),
      self.registration.unregister(),
    ]),
  );
});

self.addEventListener("fetch", () => {
  // Sem interceptação: todas as respostas vêm direto da rede.
});

function isMutation(req) {
  return ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
}

async function handleMutation(req) {
  try {
    return await fetch(req);
  } catch {
    // Offline: serializa e guarda no IndexedDB.
    try {
      const body = await req.clone().text();
      const headers = {};
      req.headers.forEach((v, k) => (headers[k] = v));
      await enqueue({
        id: crypto.randomUUID(),
        url: req.url,
        method: req.method,
        headers,
        body,
        ts: Date.now(),
      });
      if ("sync" in self.registration) {
        try {
          await self.registration.sync.register("lidercore-flush");
        } catch (_e) {
          /* ignore */
        }
      }
      return new Response(
        JSON.stringify({ queued: true, offline: true }),
        { status: 202, headers: { "Content-Type": "application/json" } },
      );
    } catch {
      return Response.error();
    }
  }
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("lidercore-offline", 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(QUEUE_STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function enqueue(item) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function listQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function removeQueued(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(QUEUE_STORE, "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function flushQueue() {
  const items = await listQueue();
  for (const item of items) {
    try {
      const res = await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body || undefined,
      });
      if (res.ok || (res.status >= 400 && res.status < 500)) {
        // sucesso ou erro cliente definitivo — remove
        await removeQueued(item.id);
      }
    } catch {
      // ainda offline, para o replay
      break;
    }
  }
  // Avisa a UI para revalidar dados
  const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
  clientsList.forEach((c) => c.postMessage({ type: "lidercore-flushed" }));
}

self.addEventListener("sync", (event) => {
  if (event.tag === "lidercore-flush") event.waitUntil(flushQueue());
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "lidercore-flush") event.waitUntil(flushQueue());
});