// Notifications library — WhatsApp via uazapi (produção) e Meta Cloud API (homologação),
// além de e-mail (SMTP) e canal in-app. Credenciais vêm todas de PlatformSetting
// (category = "notifications" / "smtp") — nada de env var.
//
// Docs:
//  - uazapi:  https://docs.uazapi.com/
//  - Meta Cloud API: https://developers.facebook.com/docs/whatsapp/cloud-api

import { prisma } from "../prisma.js";
import nodemailer from "nodemailer";

// ------- Config loader -------
export interface NotificationsConfig {
  // WhatsApp mode selection
  whatsappProvider: "uazapi" | "meta" | "off";

  // uazapi
  uazapiBaseUrl: string;   // ex: https://free.uazapi.com
  uazapiToken: string | null;
  uazapiInstance: string | null; // opcional (multi-instância)
  uazapiWebhookToken: string | null;

  // Meta Cloud API (homologação/produção)
  metaPhoneNumberId: string | null;
  metaBusinessAccountId: string | null;
  metaAccessToken: string | null;
  metaWebhookVerifyToken: string | null;
  metaAppSecret: string | null;
  metaApiVersion: string; // default v20.0

  // Defaults
  defaultCountryCode: string; // "55"
  defaultSenderName: string;
}

async function getSetting(category: "notifications" | "smtp", key: string): Promise<string | null> {
  const s = await prisma.platformSetting.findFirst({
    where: { scope: "global", scopeId: null, category, key },
  });
  return s?.value ?? null;
}

export async function loadNotificationsConfig(): Promise<NotificationsConfig> {
  const keys = [
    "whatsapp_provider",
    "uazapi_base_url",
    "uazapi_token",
    "uazapi_instance",
    "uazapi_webhook_token",
    "meta_phone_number_id",
    "meta_business_account_id",
    "meta_access_token",
    "meta_webhook_verify_token",
    "meta_app_secret",
    "meta_api_version",
    "default_country_code",
    "default_sender_name",
  ] as const;
  const values = await Promise.all(keys.map((k) => getSetting("notifications", k)));
  const m = Object.fromEntries(keys.map((k, i) => [k, values[i]])) as Record<(typeof keys)[number], string | null>;

  const providerRaw = (m.whatsapp_provider || "").toLowerCase();
  const whatsappProvider: NotificationsConfig["whatsappProvider"] =
    providerRaw === "meta" ? "meta" : providerRaw === "off" ? "off" : "uazapi";

  return {
    whatsappProvider,
    uazapiBaseUrl: (m.uazapi_base_url || "https://free.uazapi.com").replace(/\/+$/, ""),
    uazapiToken: m.uazapi_token,
    uazapiInstance: m.uazapi_instance,
    uazapiWebhookToken: m.uazapi_webhook_token,
    metaPhoneNumberId: m.meta_phone_number_id,
    metaBusinessAccountId: m.meta_business_account_id,
    metaAccessToken: m.meta_access_token,
    metaWebhookVerifyToken: m.meta_webhook_verify_token,
    metaAppSecret: m.meta_app_secret,
    metaApiVersion: m.meta_api_version || "v20.0",
    defaultCountryCode: (m.default_country_code || "55").replace(/\D/g, ""),
    defaultSenderName: m.default_sender_name || "Lider C.O.R.E.",
  };
}

export class NotificationError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

// Normaliza para E.164 sem "+" (padrão exigido tanto por uazapi quanto Meta).
export function normalizePhone(input: string, defaultCountryCode = "55"): string {
  let digits = (input || "").replace(/\D/g, "");
  if (!digits) throw new NotificationError("Telefone inválido", 400, { input });
  // Se veio sem DDI (10-11 dígitos = BR local), prefixa
  if (digits.length <= 11) digits = `${defaultCountryCode}${digits}`;
  return digits;
}

// ============================================================
// UAZAPI — WhatsApp
// Endpoints: /send/text  /send/media  /instance/status
// Auth: header  token: <API TOKEN da instância>
// ============================================================

export interface UazapiSendResult {
  id?: string;
  status?: string;
  raw: unknown;
}

export async function uazapiPing(): Promise<{ ok: boolean; status?: string; raw: unknown }> {
  const cfg = await loadNotificationsConfig();
  if (!cfg.uazapiToken) throw new NotificationError("uazapi_token não configurado", 412, null);
  const url = `${cfg.uazapiBaseUrl}/instance/status`;
  const res = await fetch(url, { headers: { token: cfg.uazapiToken } });
  const raw = await res.json().catch(() => null);
  return { ok: res.ok, status: (raw as { instance?: { status?: string } })?.instance?.status, raw };
}

export async function uazapiSendText(
  to: string,
  text: string,
): Promise<UazapiSendResult> {
  const cfg = await loadNotificationsConfig();
  if (!cfg.uazapiToken) throw new NotificationError("uazapi_token não configurado", 412, null);
  const number = normalizePhone(to, cfg.defaultCountryCode);
  const res = await fetch(`${cfg.uazapiBaseUrl}/send/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json", token: cfg.uazapiToken },
    body: JSON.stringify({ number, text }),
  });
  const raw = await res.json().catch(() => null);
  if (!res.ok) throw new NotificationError(`uazapi HTTP ${res.status}`, res.status, raw);
  const r = raw as { messageid?: string; id?: string; status?: string } | null;
  return { id: r?.messageid ?? r?.id, status: r?.status, raw };
}

// ============================================================
// META WhatsApp Cloud API (homologação)
// POST https://graph.facebook.com/{version}/{phone_number_id}/messages
// Auth: Bearer <ACCESS_TOKEN>
// ============================================================

export interface MetaSendResult {
  id?: string;
  raw: unknown;
}

export async function metaPing(): Promise<{ ok: boolean; raw: unknown }> {
  const cfg = await loadNotificationsConfig();
  if (!cfg.metaAccessToken || !cfg.metaPhoneNumberId) {
    throw new NotificationError("Meta Cloud API não configurada", 412, null);
  }
  const url = `https://graph.facebook.com/${cfg.metaApiVersion}/${cfg.metaPhoneNumberId}?fields=display_phone_number,verified_name,quality_rating`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${cfg.metaAccessToken}` } });
  const raw = await res.json().catch(() => null);
  return { ok: res.ok, raw };
}

export async function metaSendText(to: string, text: string): Promise<MetaSendResult> {
  const cfg = await loadNotificationsConfig();
  if (!cfg.metaAccessToken || !cfg.metaPhoneNumberId) {
    throw new NotificationError("Meta Cloud API não configurada", 412, null);
  }
  const number = normalizePhone(to, cfg.defaultCountryCode);
  const url = `https://graph.facebook.com/${cfg.metaApiVersion}/${cfg.metaPhoneNumberId}/messages`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.metaAccessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: number,
      type: "text",
      text: { preview_url: false, body: text },
    }),
  });
  const raw = await res.json().catch(() => null);
  if (!res.ok) throw new NotificationError(`Meta HTTP ${res.status}`, res.status, raw);
  const r = raw as { messages?: Array<{ id?: string }> } | null;
  return { id: r?.messages?.[0]?.id, raw };
}

export async function metaSendTemplate(
  to: string,
  templateName: string,
  language = "pt_BR",
  variables: string[] = [],
): Promise<MetaSendResult> {
  const cfg = await loadNotificationsConfig();
  if (!cfg.metaAccessToken || !cfg.metaPhoneNumberId) {
    throw new NotificationError("Meta Cloud API não configurada", 412, null);
  }
  const number = normalizePhone(to, cfg.defaultCountryCode);
  const url = `https://graph.facebook.com/${cfg.metaApiVersion}/${cfg.metaPhoneNumberId}/messages`;
  const components = variables.length
    ? [{ type: "body", parameters: variables.map((v) => ({ type: "text", text: v })) }]
    : undefined;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.metaAccessToken}` },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: number,
      type: "template",
      template: { name: templateName, language: { code: language }, components },
    }),
  });
  const raw = await res.json().catch(() => null);
  if (!res.ok) throw new NotificationError(`Meta HTTP ${res.status}`, res.status, raw);
  const r = raw as { messages?: Array<{ id?: string }> } | null;
  return { id: r?.messages?.[0]?.id, raw };
}

// ============================================================
// Roteador de envio
// ============================================================

export interface SendNotificationInput {
  channel: "whatsapp" | "email" | "sms" | "in_app";
  to: string;
  text?: string;              // texto livre
  subject?: string;           // e-mail
  templateCode?: string;      // procura NotificationTemplate.code
  variables?: string[];       // parâmetros para template Meta
  userId?: string | null;
  organizationId?: string | null;
  forceProvider?: "uazapi" | "meta"; // sobrescreve o global
}

function renderBody(body: string, vars: Record<string, string> = {}): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? `{{${k}}}`);
}

export async function sendNotification(input: SendNotificationInput): Promise<{ id: string; ok: boolean }> {
  const cfg = await loadNotificationsConfig();
  let channel: "whatsapp_uazapi" | "whatsapp_meta" | "email" | "sms" | "in_app" = "in_app";
  let text = input.text ?? "";
  let subject = input.subject ?? null;
  let providerId: string | null = null;
  let providerRaw: unknown = null;
  let status: "sent" | "failed" = "sent";
  let error: string | null = null;

  // Resolve template
  let template: Awaited<ReturnType<typeof prisma.notificationTemplate.findUnique>> = null;
  if (input.templateCode) {
    template = await prisma.notificationTemplate.findUnique({ where: { code: input.templateCode } });
    if (template) {
      text = renderBody(template.body, Object.fromEntries((input.variables ?? []).map((v, i) => [String(i + 1), v])));
      subject = template.subject ?? subject;
    }
  }

  try {
    if (input.channel === "whatsapp") {
      const provider =
        input.forceProvider ?? (cfg.whatsappProvider === "off" ? undefined : cfg.whatsappProvider);
      if (!provider) throw new NotificationError("WhatsApp desativado", 412, null);
      if (provider === "uazapi") {
        channel = "whatsapp_uazapi";
        const r = await uazapiSendText(input.to, text);
        providerId = r.id ?? null;
        providerRaw = r.raw;
      } else {
        channel = "whatsapp_meta";
        if (template?.metaTemplateName) {
          const r = await metaSendTemplate(
            input.to,
            template.metaTemplateName,
            template.metaLanguage ?? "pt_BR",
            input.variables ?? [],
          );
          providerId = r.id ?? null;
          providerRaw = r.raw;
        } else {
          const r = await metaSendText(input.to, text);
          providerId = r.id ?? null;
          providerRaw = r.raw;
        }
      }
    } else if (input.channel === "email") {
      channel = "email";
      // SMTP send é opcional aqui — logamos como "sent" apenas se houver configuração;
      // o transporte real fica a cargo de um worker/edge que consome a fila.
      const host = await getSetting("smtp", "host");
      if (!host) throw new NotificationError("SMTP não configurado", 412, null);
      providerRaw = { queued: true };
    } else if (input.channel === "sms") {
      channel = "sms";
      providerRaw = { queued: true };
    } else {
      channel = "in_app";
      providerRaw = { delivered: true };
    }
  } catch (err) {
    status = "failed";
    error = (err as Error).message;
    if (err instanceof NotificationError) providerRaw = err.body;
  }

  const log = await prisma.notificationLog.create({
    data: {
      channel,
      direction: "outbound",
      status,
      to: input.to,
      from: cfg.defaultSenderName,
      templateCode: input.templateCode ?? null,
      subject,
      body: text,
      providerId,
      providerRaw: providerRaw as never,
      error,
      userId: input.userId ?? null,
      organizationId: input.organizationId ?? null,
    },
  });

  return { id: log.id, ok: status === "sent" };
}

// ============================================================
// Helper de conveniência para gravar uma notificação in_app na
// caixa de entrada de um usuário. Não passa pelo roteador de
// providers — grava direto no NotificationLog com channel=in_app.
// ============================================================
export async function notifyInApp(input: {
  userId: string;
  title: string;
  body: string;
  linkUrl?: string | null;
  organizationId?: string | null;
}): Promise<{ id: string }> {
  const log = await prisma.notificationLog.create({
    data: {
      channel: "in_app",
      direction: "outbound",
      status: "delivered",
      to: input.userId,
      userId: input.userId,
      title: input.title,
      body: input.body,
      linkUrl: input.linkUrl ?? null,
      organizationId: input.organizationId ?? null,
    },
  });
  return { id: log.id };
}

export async function sendEmail(input: { to: string; subject: string; text: string; html?: string }): Promise<void> {
  const [host, portValue, username, password, fromEmail, fromName] = await Promise.all(
    ["host", "port", "username", "password", "from_email", "from_name"].map((key) => getSetting("smtp", key)),
  );
  if (!host || !fromEmail) throw new NotificationError("SMTP não configurado", 412, null);
  const port = Number(portValue || 587);
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: username ? { user: username, pass: password || "" } : undefined,
  });
  await transport.sendMail({
    from: fromName ? `"${fromName.replace(/["\r\n]/g, "")}" <${fromEmail}>` : fromEmail,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
  });
}
