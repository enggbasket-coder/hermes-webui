import { NextResponse } from "next/server";
import { getProfile, deleteProfile, renameProfile } from "@/lib/hermes/profiles";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const p = await getProfile(name);
  if (!p) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ profile: p });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const { rename } = await req.json().catch(() => ({}));
  if (typeof rename !== "string") return NextResponse.json({ error: "rename required" }, { status: 400 });
  try { await renameProfile(name, rename); return NextResponse.json({ ok: true }); }
  catch (e: any) { return NextResponse.json({ error: String(e.message || e) }, { status: 400 }); }
}

export async function DELETE(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  await deleteProfile(name);
  return NextResponse.json({ ok: true });
}
