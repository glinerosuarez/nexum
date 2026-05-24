import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type AgentInvokeResult =
  | { ok: true }
  | { ok: false; reason: "timeout" | "edge_function_error"; detail: string };

async function invokeSupplyAgentForProject(input: {
  projectId: string;
  userId: string | null;
  accessToken: string | null;
}): Promise<AgentInvokeResult> {
  const supabase = await createSupabaseServerClient();

  const invokePromise = supabase.functions.invoke("run_supply_cost_agent", {
    body: {
      project_id: input.projectId,
      mode: "manual",
      dry_run: false,
      user_id: input.userId ?? undefined,
      access_token: input.accessToken ?? undefined,
    },
  });

  const timeoutMs = 120_000;
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("agent_timeout")), timeoutMs);
  });

  let result: Awaited<ReturnType<typeof supabase.functions.invoke>>;
  try {
    result = await Promise.race([invokePromise, timeoutPromise]) as Awaited<
      ReturnType<typeof supabase.functions.invoke>
    >;
  } catch (error) {
    return {
      ok: false,
      reason: "timeout",
      detail: error instanceof Error ? error.message : "agent_timeout",
    };
  }

  if (result.error) {
    return {
      ok: false,
      reason: "edge_function_error",
      detail: result.error.message,
    };
  }

  return { ok: true };
}

export async function POST(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await context.params;
  const supabase = await createSupabaseServerClient();

  const [{ data: userData }, { data: sessionData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);

  const invocation = await invokeSupplyAgentForProject({
    projectId,
    userId: userData.user?.id ?? null,
    accessToken: sessionData.session?.access_token ?? null,
  });

  const { data: snapshot } = await supabase
    .from("agent_overrun_snapshot")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!invocation.ok) {
    return NextResponse.json(
      {
        ok: false,
        reason: invocation.reason,
        detail: invocation.detail,
        snapshot: snapshot ?? null,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    snapshot: snapshot ?? null,
  });
}
