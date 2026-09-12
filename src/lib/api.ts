// Thin HTTP client for the self-hosted API.
// Base URL is baked in at build time via VITE_API_URL.

const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "") ?? "";

const TOKEN_KEY = "lider_core_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  data: unknown;
  constructor(message: string, status: number, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

type Options = Omit<RequestInit, "body"> & { body?: unknown; auth?: boolean };

export async function api<T = unknown>(path: string, opts: Options = {}): Promise<T> {
  const { body, auth = true, headers, ...rest } = opts;
  const finalHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (auth) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  if (!API_URL) {
    throw new ApiError(
      "VITE_API_URL não configurada. Suba o backend (docker compose up) e defina VITE_API_URL no build.",
      0,
      null,
    );
  }

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: finalHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new ApiError(
      "Não foi possível conectar ao backend. Verifique se a API foi redeployada e se o domínio está online.",
      0,
      error,
    );
  }

  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();

  if (!res.ok) {
    const msg =
      (isJson && typeof data === "object" && data && "error" in data
        ? typeof (data as { error: unknown }).error === "string"
          ? (data as { error: string }).error
          : JSON.stringify((data as { error: unknown }).error)
        : typeof data === "string"
          ? data
          : "Request failed") || "Request failed";
    throw new ApiError(msg, res.status, data);
  }
  return data as T;
}

export async function uploadFile(
  path: string,
  file: File,
  fieldName = "file",
): Promise<{ url: string; path: string; filename: string; size: number; mimeType: string }> {
  if (!API_URL) {
    throw new ApiError("VITE_API_URL não configurada.", 0, null);
  }
  const token = getToken();
  const fd = new FormData();
  fd.append(fieldName, file);
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    body: fd,
  });
  const isJson = res.headers.get("content-type")?.includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    const msg =
      (isJson && typeof data === "object" && data && "error" in data
        ? String((data as { error: unknown }).error)
        : typeof data === "string"
          ? data
          : "Upload failed") || "Upload failed";
    throw new ApiError(msg, res.status, data);
  }
  return data as { url: string; path: string; filename: string; size: number; mimeType: string };
}

export type Me = {
  id: string;
  email: string;
  fullName: string | null;
  avatarUrl: string | null;
  jobTitle: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  onboardingCompletedAt?: string | null;
  onboardingSteps?: Record<string, string> | null;
  onboardingTrack?: "mentored" | "basic" | string;
  didNeoMentorship?: boolean;
  roles: string[];
  memberships: Array<{
    role: string;
    organization: { id: string; name: string; slug: string; plan: string };
  }>;
  franchiseMemberships?: Array<{
    role: string;
    franchise: { id: string; name: string; slug: string; status: string };
  }>;
};

export const authApi = {
  forgotPassword: (email: string) =>
    api<{ ok: true }>("/auth/forgot-password", { method: "POST", body: { email }, auth: false }),
  resetPassword: (email: string, code: string, newPassword: string) =>
    api<{ ok: true }>("/auth/reset-password", { method: "POST", body: { email, code, newPassword }, auth: false }),
  login: (email: string, password: string) =>
    api<{ token: string; user: { id: string; email: string; fullName: string | null } }>(
      "/auth/login",
      { method: "POST", body: { email, password }, auth: false },
    ),
  register: (email: string, password: string, fullName: string, planSlug?: string, inviteToken?: string) =>
    api<{ token: string; user: { id: string; email: string; fullName: string } }>(
      "/auth/register",
      { method: "POST", body: { email, password, fullName, planSlug, inviteToken }, auth: false },
    ),
  me: () => api<Me>("/auth/me", { method: "GET" }),
  permissions: () =>
    api<{ roles: string[]; grants: { resource: string; action: string }[]; super: boolean }>(
      "/auth/me/permissions",
      { method: "GET" },
    ),
  listSignupPlans: () =>
    api<{ plans: Array<{ slug: string; name: string; description: string | null; targetRole: string; planTier: string }> }>(
      "/auth/signup-plans",
      { method: "GET", auth: false },
    ),
  resolveInvite: (token: string) =>
    api<{
      valid: boolean;
      token: string;
      email: string | null;
      fullName: string | null;
      track: string;
      note: string | null;
      plan: { slug: string; name: string } | null;
    }>(`/auth/invites/${encodeURIComponent(token)}`, { method: "GET", auth: false }),
};
