import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { AdminPageHeader } from "@/components/admin/AdminShell";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Send, Plug, MessageCircle, Bell, FileText, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  component: NotificationsPage,
});

type ConfigStatus = {
  whatsappProvider: "uazapi" | "meta" | "off";
  uazapi: { configured: boolean; baseUrl: string; hasWebhookToken: boolean };
  meta: { configured: boolean; apiVersion: string; hasWebhookVerifyToken: boolean; hasAppSecret: boolean };
  defaultCountryCode: string;
  defaultSenderName: string;
};
type LogRow = {
  id: string;
  channel: string;
  direction: string;
  status: string;
  to: string;
  from: string | null;
  body: string | null;
  templateCode: string | null;
  providerId: string | null;
  error: string | null;
  createdAt: string;
};
type Template = {
  id: string;
  code: string;
  name: string;
  channel: "whatsapp_uazapi" | "whatsapp_meta" | "email" | "sms" | "in_app";
  subject: string | null;
  body: string;
  metaTemplateName: string | null;
  metaLanguage: string | null;
  active: boolean;
};

type Tab = "overview" | "test" | "logs" | "templates";

function NotificationsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const tabs: { key: Tab; label: string; icon: typeof Bell }[] = [
    { key: "overview", label: "Visão geral", icon: Plug },
    { key: "test", label: "Enviar teste", icon: Send },
    { key: "logs", label: "Logs", icon: FileText },
    { key: "templates", label: "Templates", icon: MessageCircle },
  ];
  return (
    <>
      <AdminPageHeader
        title="Notificações"
        description="WhatsApp (uazapi/Meta), e-mail e in-app. Credenciais ficam em Configurações → Notificações."
      />
      <div className="mb-6 flex flex-wrap gap-2 border-b border-border">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = t.key === tab;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 border-b-2 px-3 py-2 text-sm transition-colors ${
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" strokeWidth={1.5} />
              {t.label}
            </button>
          );
        })}
      </div>
      {tab === "overview" && <OverviewPanel />}
      {tab === "test" && <TestPanel />}
      {tab === "logs" && <LogsPanel />}
      {tab === "templates" && <TemplatesPanel />}
    </>
  );
}

function OverviewPanel() {
  const q = useQuery({
    queryKey: ["notifications", "config"],
    queryFn: () => api<ConfigStatus>("/notifications/config"),
  });
  const pingUaz = useMutation({
    mutationFn: () => api<{ ok: boolean; status?: string; raw?: unknown; error?: string }>("/notifications/config/ping/uazapi"),
    onSuccess: (r) => toast[r.ok ? "success" : "error"](r.ok ? `uazapi ok — ${r.status ?? "conectado"}` : (r.error ?? "falha")),
    onError: (e: Error) => toast.error(e.message),
  });
  const pingMeta = useMutation({
    mutationFn: () => api<{ ok: boolean; raw?: unknown; error?: string }>("/notifications/config/ping/meta"),
    onSuccess: (r) => toast[r.ok ? "success" : "error"](r.ok ? "Meta ok — conectado" : (r.error ?? "falha")),
    onError: (e: Error) => toast.error(e.message),
  });

  const baseUrl = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";
  const uazapiWebhook = `${baseUrl}/api/public/webhooks/uazapi`;
  const metaWebhook = `${baseUrl}/api/public/webhooks/meta`;

  if (q.isLoading) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const cfg = q.data!;

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <ProviderCard
        title="uazapi (WhatsApp — produção)"
        configured={cfg.uazapi.configured}
        active={cfg.whatsappProvider === "uazapi"}
        onPing={() => pingUaz.mutate()}
        pinging={pingUaz.isPending}
        webhookUrl={uazapiWebhook}
        badges={[
          { label: `Base: ${cfg.uazapi.baseUrl}`, ok: true },
          { label: cfg.uazapi.hasWebhookToken ? "Webhook token ✓" : "Sem webhook token", ok: cfg.uazapi.hasWebhookToken },
        ]}
        instructions={
          <ol className="ml-4 list-decimal space-y-1">
            <li>Crie a instância no painel uazapi e copie o <b>Token da instância</b>.</li>
            <li>Cadastre em Configurações → Notificações: <code>uazapi_token</code>.</li>
            <li>Defina <code>uazapi_webhook_token</code> (string aleatória) e cadastre a URL do webhook acima.</li>
          </ol>
        }
      />
      <ProviderCard
        title="Meta Cloud API (WhatsApp — homologação)"
        configured={cfg.meta.configured}
        active={cfg.whatsappProvider === "meta"}
        onPing={() => pingMeta.mutate()}
        pinging={pingMeta.isPending}
        webhookUrl={metaWebhook}
        badges={[
          { label: `API ${cfg.meta.apiVersion}`, ok: true },
          { label: cfg.meta.hasWebhookVerifyToken ? "Verify token ✓" : "Sem verify token", ok: cfg.meta.hasWebhookVerifyToken },
          { label: cfg.meta.hasAppSecret ? "App secret ✓" : "Sem app secret", ok: cfg.meta.hasAppSecret },
        ]}
        instructions={
          <ol className="ml-4 list-decimal space-y-1">
            <li>Em <b>developers.facebook.com</b> crie um app WhatsApp Business e cadastre um número.</li>
            <li>Copie <code>phone_number_id</code>, <code>business_account_id</code>, <code>access_token</code> e <code>app_secret</code>.</li>
            <li>Cole em Configurações → Notificações e defina o <code>meta_webhook_verify_token</code>.</li>
            <li>Configure o webhook no painel Meta com a URL acima e o mesmo verify token.</li>
            <li>Para produção, homologue templates aprovados e use <code>metaTemplateName</code> nos templates aqui.</li>
          </ol>
        }
      />
      <div className="md:col-span-2 rounded-2xl border border-border bg-card p-6">
        <h3 className="mb-2 flex items-center gap-2 font-display text-lg">
          <Bell className="h-4 w-4" strokeWidth={1.5} /> Provedor ativo
        </h3>
        <p className="text-sm text-muted-foreground">
          Ajuste em Configurações → Notificações → <code>whatsapp_provider</code> ={" "}
          <b>uazapi</b> (produção) · <b>meta</b> (homologação) · <b>off</b>. Atual:{" "}
          <Badge>{cfg.whatsappProvider}</Badge>
        </p>
      </div>
    </div>
  );
}

function ProviderCard({
  title,
  configured,
  active,
  onPing,
  pinging,
  webhookUrl,
  badges,
  instructions,
}: {
  title: string;
  configured: boolean;
  active: boolean;
  onPing: () => void;
  pinging: boolean;
  webhookUrl: string;
  badges: { label: string; ok: boolean }[];
  instructions: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-lg">{title}</h3>
        <div className="flex gap-2">
          {active && <Badge variant="default">Ativo</Badge>}
          <Badge variant={configured ? "secondary" : "outline"}>
            {configured ? "Configurado" : "Faltam credenciais"}
          </Badge>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {badges.map((b) => (
          <Badge key={b.label} variant={b.ok ? "secondary" : "outline"}>
            {b.label}
          </Badge>
        ))}
      </div>
      <div className="mb-4 space-y-1">
        <Label>Webhook URL</Label>
        <div className="flex gap-2">
          <Input readOnly value={webhookUrl} className="font-mono text-xs" />
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => {
              navigator.clipboard.writeText(webhookUrl);
              toast.success("Copiado");
            }}
          >
            <Copy className="h-4 w-4" strokeWidth={1.5} />
          </Button>
        </div>
      </div>
      <div className="mb-4 text-xs text-muted-foreground">{instructions}</div>
      <Button onClick={onPing} disabled={pinging || !configured}>
        <Plug className="mr-2 h-4 w-4" strokeWidth={1.5} />
        {pinging ? "Testando…" : "Testar conexão"}
      </Button>
    </div>
  );
}

function TestPanel() {
  const [channel, setChannel] = useState<"whatsapp" | "email" | "in_app" | "sms">("whatsapp");
  const [forceProvider, setForceProvider] = useState<"" | "uazapi" | "meta">("");
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [text, setText] = useState("Olá! Este é um teste de notificação do Lider C.O.R.E. 🚀");

  const send = useMutation({
    mutationFn: () =>
      api<{ id: string; ok: boolean }>("/notifications/test", {
        method: "POST",
        body: {
          channel,
          to,
          text,
          subject: subject || undefined,
          forceProvider: forceProvider || undefined,
        },
      }),
    onSuccess: (r) => toast[r.ok ? "success" : "error"](r.ok ? "Enviado — verifique os Logs" : "Falha — veja os Logs"),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="max-w-2xl rounded-2xl border border-border bg-card p-6">
      <h3 className="mb-4 font-display text-lg">Enviar notificação de teste</h3>
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Canal</Label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={channel}
              onChange={(e) => setChannel(e.target.value as typeof channel)}
            >
              <option value="whatsapp">WhatsApp</option>
              <option value="email">E-mail</option>
              <option value="sms">SMS</option>
              <option value="in_app">In-app</option>
            </select>
          </div>
          {channel === "whatsapp" && (
            <div>
              <Label>Forçar provedor</Label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={forceProvider}
                onChange={(e) => setForceProvider(e.target.value as typeof forceProvider)}
              >
                <option value="">Padrão (configurado)</option>
                <option value="uazapi">uazapi</option>
                <option value="meta">Meta</option>
              </select>
            </div>
          )}
        </div>
        <div>
          <Label>Destinatário {channel === "whatsapp" ? "(telefone com DDI, ex 5511999999999)" : channel === "email" ? "(e-mail)" : ""}</Label>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder={channel === "email" ? "email@empresa.com" : "5511999999999"} />
        </div>
        {channel === "email" && (
          <div>
            <Label>Assunto</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
        )}
        <div>
          <Label>Mensagem</Label>
          <Textarea rows={5} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <Button onClick={() => send.mutate()} disabled={send.isPending || !to || !text}>
          <Send className="mr-2 h-4 w-4" strokeWidth={1.5} />
          {send.isPending ? "Enviando…" : "Enviar"}
        </Button>
      </div>
    </div>
  );
}

function statusBadge(s: string) {
  const v =
    s === "sent" ? "secondary" : s === "delivered" || s === "read" ? "default" : s === "failed" ? "destructive" : "outline";
  return <Badge variant={v as never}>{s}</Badge>;
}

function LogsPanel() {
  const q = useQuery({
    queryKey: ["notifications", "logs"],
    queryFn: () => api<LogRow[]>("/notifications/logs?take=100"),
    refetchInterval: 5000,
  });
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="border-b border-border p-4">
        <h3 className="font-display text-lg">Logs de notificações</h3>
        <p className="text-xs text-muted-foreground">Atualiza a cada 5 segundos. Últimos 100 eventos.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="p-3 text-left">Quando</th>
              <th className="p-3 text-left">Canal</th>
              <th className="p-3 text-left">Direção</th>
              <th className="p-3 text-left">Status</th>
              <th className="p-3 text-left">Para / De</th>
              <th className="p-3 text-left">Mensagem</th>
              <th className="p-3 text-left">Provider ID</th>
            </tr>
          </thead>
          <tbody>
            {q.data?.map((r) => (
              <tr key={r.id} className="border-t border-border">
                <td className="p-3 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleString("pt-BR")}</td>
                <td className="p-3">{r.channel}</td>
                <td className="p-3">{r.direction}</td>
                <td className="p-3">{statusBadge(r.status)}</td>
                <td className="p-3 text-xs">{r.direction === "inbound" ? r.from : r.to}</td>
                <td className="p-3 max-w-[320px] truncate text-xs">{r.body ?? r.error ?? "—"}</td>
                <td className="p-3 font-mono text-xs">{r.providerId ?? "—"}</td>
              </tr>
            ))}
            {!q.data?.length && (
              <tr>
                <td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma notificação ainda. Envie um teste!
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TemplatesPanel() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["notifications", "templates"],
    queryFn: () => api<Template[]>("/notifications/templates"),
  });
  const empty: Template = {
    id: "",
    code: "",
    name: "",
    channel: "whatsapp_uazapi",
    subject: "",
    body: "",
    metaTemplateName: "",
    metaLanguage: "pt_BR",
    active: true,
  };
  const [draft, setDraft] = useState<Template>(empty);

  const save = useMutation({
    mutationFn: (t: Template) =>
      api<Template>("/notifications/templates", { method: "POST", body: t }),
    onSuccess: () => {
      toast.success("Template salvo");
      setDraft(empty);
      qc.invalidateQueries({ queryKey: ["notifications", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => api(`/notifications/templates/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success("Removido");
      qc.invalidateQueries({ queryKey: ["notifications", "templates"] });
    },
  });
  const seedCorp = useMutation({
    mutationFn: () =>
      api<{ ok: boolean; created: string[] }>("/notifications/templates/seed-corporate-goals", {
        method: "POST",
      }),
    onSuccess: (r) => {
      toast.success(`Templates das Metas da Corporação carregados (${r.created.length})`);
      qc.invalidateQueries({ queryKey: ["notifications", "templates"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="grid gap-6 md:grid-cols-[1fr_380px]">
      <div className="rounded-2xl border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
          <div>
            <h3 className="font-display text-lg">Templates cadastrados</h3>
            <p className="text-xs text-muted-foreground">Use <code>{"{{1}}"}</code>, <code>{"{{2}}"}</code>… para variáveis (compatível com Meta).</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => seedCorp.mutate()} disabled={seedCorp.isPending}>
            <Copy className="mr-1.5 h-3.5 w-3.5" strokeWidth={1.5} />
            {seedCorp.isPending ? "Carregando…" : "Seed Metas da Corporação"}
          </Button>
        </div>
        <div className="divide-y divide-border">
          {q.data?.map((t) => (
            <div key={t.id} className="flex items-start justify-between gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <b>{t.name}</b>
                  <Badge variant="outline">{t.channel}</Badge>
                  {!t.active && <Badge variant="destructive">inativo</Badge>}
                </div>
                <p className="mt-1 font-mono text-xs text-muted-foreground">{t.code}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm">{t.body}</p>
                {t.metaTemplateName && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Meta template aprovado: <b>{t.metaTemplateName}</b> ({t.metaLanguage})
                  </p>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setDraft(t)}>
                  Editar
                </Button>
                <Button variant="ghost" size="icon" onClick={() => del.mutate(t.id)}>
                  <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                </Button>
              </div>
            </div>
          ))}
          {!q.data?.length && (
            <p className="p-8 text-center text-sm text-muted-foreground">Nenhum template. Crie o primeiro à direita.</p>
          )}
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-card p-4">
        <h3 className="mb-3 font-display text-lg">{draft.id ? "Editar template" : "Novo template"}</h3>
        <div className="space-y-3">
          <div>
            <Label>Código</Label>
            <Input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="pdi_created" />
          </div>
          <div>
            <Label>Nome</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="PDI criado" />
          </div>
          <div>
            <Label>Canal</Label>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={draft.channel}
              onChange={(e) => setDraft({ ...draft, channel: e.target.value as Template["channel"] })}
            >
              <option value="whatsapp_uazapi">WhatsApp (uazapi)</option>
              <option value="whatsapp_meta">WhatsApp (Meta)</option>
              <option value="email">E-mail</option>
              <option value="sms">SMS</option>
              <option value="in_app">In-app</option>
            </select>
          </div>
          {draft.channel === "email" && (
            <div>
              <Label>Assunto</Label>
              <Input value={draft.subject ?? ""} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
            </div>
          )}
          <div>
            <Label>Corpo</Label>
            <Textarea rows={5} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          </div>
          {draft.channel === "whatsapp_meta" && (
            <>
              <div>
                <Label>Template Meta aprovado (opcional)</Label>
                <Input
                  value={draft.metaTemplateName ?? ""}
                  onChange={(e) => setDraft({ ...draft, metaTemplateName: e.target.value })}
                  placeholder="ex: welcome_pt"
                />
              </div>
              <div>
                <Label>Idioma Meta</Label>
                <Input value={draft.metaLanguage ?? "pt_BR"} onChange={(e) => setDraft({ ...draft, metaLanguage: e.target.value })} />
              </div>
            </>
          )}
          <div className="flex gap-2">
            <Button onClick={() => save.mutate(draft)} disabled={save.isPending || !draft.code || !draft.name || !draft.body}>
              Salvar
            </Button>
            {draft.id && (
              <Button variant="outline" onClick={() => setDraft(empty)}>
                Cancelar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}