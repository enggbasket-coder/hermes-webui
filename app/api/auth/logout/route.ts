import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";

export async function POST(req: Request) {
  const s = await getSession();
  s.destroy();
  return NextResponse.redirect(new URL("/login", req.url), { status: 303 });
}
