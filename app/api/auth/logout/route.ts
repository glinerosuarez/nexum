import { NextResponse } from "next/server";
import { headers } from "next/headers";

async function getPublicOrigin(req: Request): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  if (host) return `${proto}://${host}`;
  return new URL(req.url).origin;
}

export async function POST(req: Request) {
  const form = await req.formData();
  const rawNext = (form.get("next") ?? "").toString().trim();
  const nextPath =
    rawNext.startsWith("/") && !rawNext.startsWith("//")
      ? rawNext
      : "/";

  const origin = await getPublicOrigin(req);
  const response = NextResponse.redirect(new URL(nextPath, origin), 303);
  response.cookies.set({
    name: "firebase_id_token",
    value: "",
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
