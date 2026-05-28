import { NextResponse } from "next/server";
import { readJob, audit } from "@/lib/jobs";
import { runWizard } from "@/lib/hermes/wizard";

export const dynamic = "force-dynamic";

// Resume-from-failed-step retry. runWizard re-reads the job and skips
// steps that are already in "completed" status, so we just need to mark
// the failed step back to "pending" and re-launch.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await readJob(id);
  if (!job) return NextResponse.json({ error: "not found" }, { status: 404 });

  if (job.kind !== "profile.wizard") {
    return NextResponse.json({ error: "unsupported job kind" }, { status: 400 });
  }
  if (job.status === "running") {
    return NextResponse.json({ error: "already running" }, { status: 409 });
  }

  // Reset failed step + any later "pending" steps; preserve completed ones.
  for (const s of job.steps) {
    if (s.status === "error" || s.status === "interrupted") {
      s.status = "pending";
      s.startedAt = undefined;
      s.finishedAt = undefined;
      s.message = undefined;
    }
  }
  job.status = "pending";
  job.failedStepKey = undefined;
  const { writeJob } = await import("@/lib/jobs");
  await writeJob(job);

  void runWizard(id).catch((e) => {
    console.error(`[hermes-webui] wizard ${id} retry crashed:`, e);
  });

  await audit({ action: "profile.wizard.retry", jobId: id });

  return NextResponse.json({ jobId: id, retried: true }, { status: 202 });
}
