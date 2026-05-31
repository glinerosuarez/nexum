import { NextResponse } from "next/server";
import { headers } from "next/headers";
import {
  signInAnonymously,
  signInWithEmailPassword,
} from "@/lib/firebase-auth";

const DEFAULT_NEXT_PATH = "/dashboard/proyectos";

function normalizeNextPath(raw: FormDataEntryValue | null): string {
  const value = (raw ?? "").toString().trim();
  if (!value.startsWith("/")) return DEFAULT_NEXT_PATH;
  if (value.startsWith("//")) return DEFAULT_NEXT_PATH;
  return value;
}

function normalizeMode(raw: FormDataEntryValue | null): "anonymous" | "password" {
  const value = (raw ?? "").toString().trim();
  return value === "password" ? "password" : "anonymous";
}

function toSeconds(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 3600;
  return Math.min(Math.floor(n), 60 * 60 * 24 * 7);
}

async function getPublicOrigin(req: Request): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

function redirectWithError(
  origin: string,
  nextPath: string,
  reason: string,
): NextResponse {
  const params = new URLSearchParams({
    next: nextPath,
    error: reason,
  });
  return NextResponse.redirect(new URL(`/login?${params.toString()}`, origin), 303);
}

export async function POST(req: Request) {
  const form = await req.formData();
  const nextPath = normalizeNextPath(form.get("next"));
  const mode = normalizeMode(form.get("mode"));
  const origin = await getPublicOrigin(req);

  try {
    const auth =
      mode === "password"
        ? await signInWithEmailPassword(
            (form.get("email") ?? "").toString().trim(),
            (form.get("password") ?? "").toString(),
          )
        : await signInAnonymously();

    const response = NextResponse.redirect(
      new URL(nextPath, origin),
      303,
    );
    response.cookies.set({
      name: "firebase_id_token",
      value: auth.idToken,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: toSeconds(auth.expiresIn),
    });
    return response;
  } catch (error) {
    const reason =
      error instanceof Error ? error.message : "AUTH_FAILED";
    return redirectWithError(origin, nextPath, reason);
  }
}
