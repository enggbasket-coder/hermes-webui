import { NextResponse } from "next/server";
import { readJob, redactJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await readJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ job: redactJob(job) });
}
