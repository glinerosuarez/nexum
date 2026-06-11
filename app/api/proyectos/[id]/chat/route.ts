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

function translateDeterministicChatContent(content: string): string {
  let next = content;
  next = next.replace(/^Resumen rápido de /, "Quick summary of ");
  next = next.replace(/^- Presupuesto:/m, "- Budget:");
  next = next.replace(/^- Gasto ejecutado:/m, "- Executed spend:");
  next = next.replace(/^- Avance global:/m, "- Overall progress:");
  next = next.replace(
    /Pregunta adicional sugerida: ¿quieres que detalle riesgos por fase o por insumo\?/,
    "Suggested follow-up: would you like me to break down risks by phase or by supply?",
  );
  return next;
}

function translateChatMessage(message: ChatMessage): ChatMessage {
  if (message.role !== "assistant") return message;
  return {
    ...message,
    content: translateDeterministicChatContent(message.content),
  };
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

    return NextResponse.json({
      ...payload,
      messages: (payload.messages ?? []).map(translateChatMessage),
    });
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

    return NextResponse.json({
      ...payload,
      messages: (payload.messages ?? []).map(translateChatMessage),
      assistant_message: payload.assistant_message
        ? translateChatMessage(payload.assistant_message)
        : undefined,
    });
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
