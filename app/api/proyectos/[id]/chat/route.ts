import { NextResponse } from "next/server";
import {
  getIncomingBearerFromRequest,
  nexumApiRequest,
} from "@/lib/nexum-api/client";

interface ChatMessage {
  id: string;
  session_id: string;
  project_id: string;
  role: string;
  content: string;
  metadata: unknown;
  created_at: string;
}

interface ChatSession {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
}

interface ChatGetResponse {
  ok: boolean;
  session: ChatSession | null;
  messages: ChatMessage[];
  detail?: string;
}

interface ChatPostResponse {
  ok: boolean;
  session: ChatSession;
  messages: ChatMessage[];
  assistant_message?: ChatMessage;
  grounding?: Record<string, unknown>;
  model?: string;
  detail?: string;
}

export async function GET(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("session_id");

  try {
    const params = new URLSearchParams({ project_id: projectId });
    if (sessionId) params.set("session_id", sessionId);

    const payload = await nexumApiRequest<ChatGetResponse>(
      `/chat/messages?${params.toString()}`,
      {
        method: "GET",
        bearerToken: getIncomingBearerFromRequest(req),
      },
    );

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        detail: error instanceof Error ? error.message : "No pudimos cargar el historial.",
      },
      { status: 502 },
    );
  }
}

export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;
  const body = await req.json().catch(() => ({}));

  const message = (body?.message ?? "").toString().trim();
  if (!message) {
    return NextResponse.json(
      { ok: false, detail: "El mensaje no puede estar vacío." },
      { status: 400 },
    );
  }

  try {
    const payload = await nexumApiRequest<ChatPostResponse>("/chat/messages", {
      method: "POST",
      bearerToken: getIncomingBearerFromRequest(req),
      body: {
        project_id: projectId,
        message,
        session_id: (body?.session_id ?? "").toString().trim() || null,
        new_session: body?.new_session === true,
      },
    });

    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        detail: error instanceof Error ? error.message : "No pudimos obtener respuesta del chat.",
      },
      { status: 502 },
    );
  }
}
