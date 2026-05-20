import { NextResponse } from "next/server";
import {
  getGatewayStatus,
  startGateway,
  stopGateway,
  restartGateway,
} from "@/lib/hermes/profiles";

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
    return NextResponse.json(
      { error: "action must be start|stop|restart|status" },
      { status: 400 },
    );
  }

  if (action === "status") {
    return NextResponse.json({ ok: true, status: await getGatewayStatus(profile) });
  }

  let result;
  if (action === "start") result = await startGateway(profile);
  else if (action === "stop") result = await stopGateway(profile);
  else result = await restartGateway(profile);

  return NextResponse.json({
    ok: result.ok,
    pid: result.pid,
    stdout: result.message,
    stderr: "",
    status: result.status,
  });
}
