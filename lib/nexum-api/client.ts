import { cookies, headers } from "next/headers";

const DEFAULT_TIMEOUT_MS = 120_000;

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function getNexumApiBaseUrl(): string {
  const baseUrl = process.env.NEXUM_API_BASE_URL?.trim();
  if (!baseUrl) {
    throw new Error("Missing NEXUM_API_BASE_URL environment variable.");
  }
  return trimTrailingSlash(baseUrl);
}

function normalizeBearerValue(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^Bearer\s+/i.test(trimmed)) return trimmed;
  return `Bearer ${trimmed}`;
}

export async function resolveFirebaseBearerFromServerContext(): Promise<string | null> {
  const requestHeaders = await headers();
  const headerToken = normalizeBearerValue(requestHeaders.get("authorization"));
  if (headerToken) return headerToken;

  const cookieStore = await cookies();
  const cookieToken = cookieStore.get("firebase_id_token")?.value ?? null;
  return normalizeBearerValue(cookieToken);
}

export interface NexumApiRequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  bearerToken?: string | null;
  extraHeaders?: HeadersInit;
  timeoutMs?: number;
  cache?: RequestCache;
}

export async function nexumApiRequest<T>(
  path: string,
  options: NexumApiRequestOptions = {},
): Promise<T> {
  const baseUrl = getNexumApiBaseUrl();
  const targetUrl = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const requestHeaders = new Headers(options.extraHeaders);
  requestHeaders.set("Accept", "application/json");

  if (options.body !== undefined) {
    requestHeaders.set("Content-Type", "application/json");
  }

  const bearer = normalizeBearerValue(
    options.bearerToken ?? (await resolveFirebaseBearerFromServerContext()),
  );
  if (bearer) {
    requestHeaders.set("Authorization", bearer);
  }

  try {
    const response = await fetch(targetUrl, {
      method: options.method ?? "GET",
      headers: requestHeaders,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: options.cache ?? "no-store",
      signal: controller.signal,
    });

    const payload = (await response
      .json()
      .catch(() => ({}))) as T & { detail?: string; error?: string };

    if (!response.ok) {
      const detail =
        (payload as { detail?: string }).detail ??
        (payload as { error?: string }).error ??
        `nexum_api_http_${response.status}`;
      throw new Error(detail);
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getIncomingBearerFromRequest(req: Request): string | null {
  return normalizeBearerValue(req.headers.get("authorization"));
}

export function isFirebaseAuthError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const message = error.message.toLowerCase();
  return (
    message.includes("missing firebase bearer token") ||
    message.includes("invalid firebase bearer token") ||
    message.includes("firebase token verification failed")
  );
}

export function isUnauthorizedProjectAccessError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return error.message.toLowerCase().includes("unauthorized project access");
}
