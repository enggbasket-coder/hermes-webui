import { NextResponse } from "next/server";
import { runHermes } from "@/lib/hermes/cli";
import { getGatewayStatus } from "@/lib/hermes/profiles";

export const dynamic = "force-dynamic";

const ACTIONS = new Set(["start", "stop", "restart", "status"]);

export async function GET(_: Request, { params }: { params: Promise<{ profile: string }> }) {
  const { profile } = await params;
  return NextResponse.json({ status: await getGatewayStatus(profile) });
}

export async function POST(req: Request, { params }: { params: Promise<{ profile: string }> }) {
  const { profile } = await params;
  const { action } = await req.json().catch(() => ({}));
  if (!ACTIONS.has(action)) {
    return NextResponse.json({ error: "action must be start|stop|restart|status" }, { status: 400 });
  }
  const r = await runHermes(profile, ["gateway", action], { timeoutMs: 15_000 });
  return NextResponse.json({
    ok: r.code === 0,
    code: r.code,
    stdout: r.stdout,
    stderr: r.stderr,
    status: await getGatewayStatus(profile),
  });
}
