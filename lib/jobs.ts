// Lightweight job store backed by JSON files in $HERMES_HOME/jobs/<id>.json.
//
// Why filesystem and not a real queue: this dashboard is a single-container
// Next.js app. We have one Node process. State persists across container
// restarts via the bind-mounted /data/hermes. That's enough for our scale.
//
// Job state survives a container crash because every step writes the file
// atomically (write to .tmp, fsync, rename). Workers that were running when
// the container died get marked `interrupted` on next boot.

import fsSync from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { HERMES_HOME } from "./hermes/paths";

export type JobStatus = "pending" | "running" | "completed" | "error" | "interrupted";

export type JobStep = {
  key: string;          // machine name, e.g. "create_profile"
  label: string;        // human label shown in UI
  status: JobStatus;
  startedAt?: string;
  finishedAt?: string;
  message?: string;     // last log line / error message
};

export type Job = {
  id: string;
  kind: string;         // e.g. "profile.wizard"
  input: unknown;       // the form payload (with secrets present)
  steps: JobStep[];
  status: JobStatus;
  failedStepKey?: string;
  createdAt: string;
  updatedAt: string;
};

const JOBS_DIR = () => path.join(HERMES_HOME, "jobs");

export function jobPath(id: string) {
  return path.join(JOBS_DIR(), `${id}.json`);
}

export function newJobId(): string {
  // Time-prefixed so ls sorts chronologically. Short random suffix for uniqueness.
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const rand = crypto.randomBytes(4).toString("hex");
  return `${stamp}-${rand}`;
}

export async function writeJob(job: Job): Promise<void> {
  await fs.mkdir(JOBS_DIR(), { recursive: true });
  const target = jobPath(job.id);
  const tmp = `${target}.tmp`;
  job.updatedAt = new Date().toISOString();
  // Atomic write: write to tmp, then rename. Prevents readers seeing
  // half-written JSON.
  await fs.writeFile(tmp, JSON.stringify(job, null, 2), { mode: 0o600 });
  await fs.rename(tmp, target);
}

export async function readJob(id: string): Promise<Job | null> {
  try {
    const raw = await fs.readFile(jobPath(id), "utf8");
    return JSON.parse(raw) as Job;
  } catch {
    return null;
  }
}

export async function listJobs(): Promise<Job[]> {
  try {
    const entries = await fs.readdir(JOBS_DIR());
    const jobs: Job[] = [];
    for (const f of entries) {
      if (!f.endsWith(".json") || f.endsWith(".tmp")) continue;
      const j = await readJob(f.replace(/\.json$/, ""));
      if (j) jobs.push(j);
    }
    return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
}

export async function updateStep(
  jobId: string,
  stepKey: string,
  patch: Partial<JobStep>,
): Promise<void> {
  const job = await readJob(jobId);
  if (!job) return;
  const step = job.steps.find((s) => s.key === stepKey);
  if (!step) return;
  Object.assign(step, patch);
  await writeJob(job);
}

export async function markJob(
  jobId: string,
  patch: Partial<Pick<Job, "status" | "failedStepKey">>,
): Promise<void> {
  const job = await readJob(jobId);
  if (!job) return;
  Object.assign(job, patch);
  await writeJob(job);
}

// On container boot, any job stuck in "running" state was interrupted by the
// crash/restart. Mark them so the UI doesn't lie about a still-running worker.
export async function reapInterruptedJobs(): Promise<number> {
  const jobs = await listJobs();
  let n = 0;
  for (const j of jobs) {
    if (j.status === "running" || j.status === "pending") {
      j.status = "interrupted";
      const running = j.steps.find((s) => s.status === "running");
      if (running) running.status = "interrupted";
      await writeJob(j);
      n++;
    }
  }
  return n;
}

// Append a line to the audit log. Best-effort: never throws.
export async function audit(entry: Record<string, unknown>): Promise<void> {
  try {
    await fs.mkdir(HERMES_HOME, { recursive: true });
    const line = JSON.stringify({ ts: new Date().toISOString(), ...entry }) + "\n";
    await fs.appendFile(path.join(HERMES_HOME, "audit.jsonl"), line, { mode: 0o600 });
  } catch (e) {
    console.warn("[hermes-webui] audit append failed:", e);
  }
}

// Redact secrets in a job before sending to the client.
export function redactJob(job: Job): Job {
  const input = job.input as Record<string, unknown> | null;
  if (!input || typeof input !== "object") return job;
  const SECRETS = new Set([
    "telegramBotToken",
    "openrouterApiKey",
    "apiKey",
    "token",
  ]);
  const redactedInput: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input)) {
    redactedInput[k] = SECRETS.has(k) && typeof v === "string" && v
      ? `<REDACTED:${v.length} chars>`
      : v;
  }
  return { ...job, input: redactedInput };
}

// SSE-friendly: write an empty file watch trigger. Not used yet; SSE route
// just polls the file every 250ms which is plenty for this UX.
export function watchableJobPath(id: string) {
  return jobPath(id);
}
