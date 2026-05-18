import { NextResponse } from "next/server";
import { getSession, verifyPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({}));
  if (typeof password !== "string" || !(await verifyPassword(password))) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const s = await getSession();
  s.authed = true;
  await s.save();
  return NextResponse.json({ ok: true });
}
