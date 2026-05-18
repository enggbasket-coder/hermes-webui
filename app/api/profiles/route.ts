import { NextResponse } from "next/server";
import { listProfiles, createProfile } from "@/lib/hermes/profiles";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const profiles = await listProfiles();
    return NextResponse.json({ profiles });
  } catch (e: any) {
    return NextResponse.json({ profiles: [], error: String(e) }, { status: 200 });
  }
}

export async function POST(req: Request) {
  const { name } = await req.json().catch(() => ({}));
  if (typeof name !== "string") return NextResponse.json({ error: "name required" }, { status: 400 });
  try {
    await createProfile(name);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: String(e.message || e) }, { status: 400 });
  }
}
