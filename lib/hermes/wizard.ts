// Profile + gateway provisioning wizard.
//
// One worker function runs all the steps of a single job. Each step:
//   - marks its step status -> "running"
//   - does the work
//   - marks "completed" (or "error", in which case we stop)
//
// Designed to be idempotent at the STEP level. Re-running a step that
// already completed should detect the existing state and short-circuit;
// re-running a failed step starts fresh. This supports "Resume from
// failed step" retry semantics.

import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  HERMES_BIN, HERMES_HOME, profileDir, profileFile,
} from "./paths";
import { runHermes } from "./cli";
import { startGateway } from "./profiles";
import {
  type Job, type JobStep,
  readJob, writeJob, updateStep, markJob, audit,
} from "../jobs";

export type WizardInput = {
  name: string;
  cloneFrom?: string | null;
  model: string;             // e.g. "anthropic/claude-haiku-4.5"
  telegramBotToken: string;
  telegramAllowedUsers: string;  // comma-separated user IDs as user typed
  openrouterApiKey?: string;     // empty → inherit from default profile
  startGateway: boolean;
};

export const WIZARD_STEPS: Pick<JobStep, "key" | "label">[] = [
  { key: "validate",        label: "Validate inputs" },
  { key: "create_profile",  label: "Create Hermes profile" },
  { key: "write_telegram",  label: "Write Telegram credentials" },
  { key: "write_openrouter",label: "Write OpenRouter key" },
  { key: "set_model",       label: "Set default model" },
  { key: "start_gateway",   label: "Start gateway" },
];

export function buildWizardJob(id: string, input: WizardInput): Job {
  const now = new Date().toISOString();
  return {
    id,
    kind: "profile.wizard",
    input,
    status: "pending",
    createdAt: now,
    updatedAt: now,
    steps: WIZARD_STEPS.map((s) => ({ ...s, status: "pending" })),
  };
}

// Live token validation: GET https://api.telegram.org/bot<TOKEN>/getMe
async function validateTelegramToken(token: string): Promise<{ ok: boolean; username?: string; error?: string }> {
  if (!/^\d{8,12}:[A-Za-z0-9_-]{30,}$/.test(token)) {
    return { ok: false, error: "Token format looks wrong (expected 'NNNNNNN:XX...XX')." };
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const r = await fetch(`https://api.telegram.org/bot${token}/getMe`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!r.ok) return { ok: false, error: `Telegram responded HTTP ${r.status}` };
    const j = (await r.json()) as { ok: boolean; result?: { username?: string }; description?: string };
    if (!j.ok) return { ok: false, error: j.description || "Telegram rejected token" };
    return { ok: true, username: j.result?.username };
  } catch (e: any) {
    return { ok: false, error: `Couldn't reach Telegram: ${e?.message || e}` };
  }
}

// Atomic file write: write to .tmp then rename. Same pattern as jobs.ts.
async function writeAtomic(target: string, contents: string, mode = 0o600): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.writeFile(tmp, contents, { mode });
  await fs.rename(tmp, target);
}

// Merge-only env writer: read existing .env, set/replace given keys, preserve
// everything else. Never deletes keys we didn't pass.
async function mergeEnv(envPath: string, pairs: Record<string, string>): Promise<void> {
  let existing = "";
  try { existing = await fs.readFile(envPath, "utf8"); } catch {}
  const lines = existing.split("\n");
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of lines) {
    const m = /^([A-Z_][A-Z0-9_]*)\s*=/.exec(line);
    if (m && pairs[m[1]] !== undefined) {
      out.push(`${m[1]}=${pairs[m[1]]}`);
      seen.add(m[1]);
    } else {
      out.push(line);
    }
  }
  for (const [k, v] of Object.entries(pairs)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  // Trim trailing empty lines but keep one final newline.
  let txt = out.join("\n");
  while (txt.endsWith("\n\n")) txt = txt.slice(0, -1);
  if (!txt.endsWith("\n")) txt += "\n";
  await writeAtomic(envPath, txt, 0o600);
}

async function profileExists(name: string): Promise<boolean> {
  try { await fs.stat(profileDir(name)); return true; } catch { return false; }
}

// Run a single step with consistent timing + error capture.
async function runStep(
  jobId: string,
  key: string,
  fn: () => Promise<string>,
): Promise<{ ok: true; message: string } | { ok: false; error: string }> {
  await updateStep(jobId, key, { status: "running", startedAt: new Date().toISOString(), message: undefined });
  try {
    const message = await fn();
    await updateStep(jobId, key, {
      status: "completed",
      finishedAt: new Date().toISOString(),
      message,
    });
    return { ok: true, message };
  } catch (e: any) {
    const error = String(e?.message || e);
    await updateStep(jobId, key, {
      status: "error",
      finishedAt: new Date().toISOString(),
      message: error,
    });
    return { ok: false, error };
  }
}

// The actual orchestrator. Fire-and-forget from the API handler.
// Picks up where a prior attempt left off based on step.status.
export async function runWizard(jobId: string): Promise<void> {
  const job = await readJob(jobId);
  if (!job) return;
  const input = job.input as WizardInput;
  await markJob(jobId, { status: "running", failedStepKey: undefined });

  const shouldRun = (key: string) => {
    const s = job.steps.find((x) => x.key === key);
    return s && s.status !== "completed";
  };

  // Step 1 — validate
  if (shouldRun("validate")) {
    const r = await runStep(jobId, "validate", async () => {
      if (!/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(input.name)) {
        throw new Error("Invalid profile name (alphanumeric, dash, underscore; 1-41 chars).");
      }
      if (input.cloneFrom && !(await profileExists(input.cloneFrom))) {
        throw new Error(`Clone source "${input.cloneFrom}" does not exist.`);
      }
      if (await profileExists(input.name)) {
        throw new Error(`Profile "${input.name}" already exists.`);
      }
      const allowed = input.telegramAllowedUsers.split(",").map((s) => s.trim()).filter(Boolean);
      if (allowed.length === 0) {
        throw new Error("At least one allowed Telegram user ID is required.");
      }
      for (const u of allowed) {
        if (!/^\d{5,15}$/.test(u)) throw new Error(`Bad user ID: "${u}"`);
      }
      const tg = await validateTelegramToken(input.telegramBotToken);
      if (!tg.ok) throw new Error(`Telegram token: ${tg.error}`);
      return `Bot @${tg.username || "?"} validated. Allowed users: ${allowed.length}.`;
    });
    if (!r.ok) { await markJob(jobId, { status: "error", failedStepKey: "validate" }); return; }
  }

  // Step 2 — create profile via the official CLI
  if (shouldRun("create_profile")) {
    const r = await runStep(jobId, "create_profile", async () => {
      const args = ["profile", "create", input.name];
      if (input.cloneFrom) args.push("--clone", "--clone-from", input.cloneFrom);
      const res = await runHermes(null, args, { timeoutMs: 60_000 });
      if (res.code !== 0) {
        throw new Error(`hermes profile create failed (code ${res.code}): ${res.stderr || res.stdout}`);
      }
      return `Created at ${profileDir(input.name)}.`;
    });
    if (!r.ok) { await markJob(jobId, { status: "error", failedStepKey: "create_profile" }); return; }
  }

  // Step 3 — write Telegram credentials into the new profile's .env
  if (shouldRun("write_telegram")) {
    const r = await runStep(jobId, "write_telegram", async () => {
      const allowed = input.telegramAllowedUsers
        .split(",").map((s) => s.trim()).filter(Boolean).join(",");
      const homeChannel = allowed.split(",")[0];
      await mergeEnv(profileFile(input.name, ".env"), {
        TELEGRAM_BOT_TOKEN: input.telegramBotToken,
        TELEGRAM_ALLOWED_USERS: allowed,
        TELEGRAM_HOME_CHANNEL: homeChannel,
      });
      return `Wrote 3 env keys (token redacted).`;
    });
    if (!r.ok) { await markJob(jobId, { status: "error", failedStepKey: "write_telegram" }); return; }
  }

  // Step 4 — write OpenRouter key (or inherit from default profile)
  if (shouldRun("write_openrouter")) {
    const r = await runStep(jobId, "write_openrouter", async () => {
      let key = input.openrouterApiKey?.trim();
      if (!key) {
        // Inherit from default profile
        try {
          const root = await fs.readFile(path.join(HERMES_HOME, ".env"), "utf8");
          const m = /^OPENROUTER_API_KEY=(.+)$/m.exec(root);
          if (!m) throw new Error("default profile has no OPENROUTER_API_KEY to inherit");
          key = m[1].trim();
        } catch (e: any) {
          throw new Error(`No key provided and inherit failed: ${e?.message || e}`);
        }
      }
      await mergeEnv(profileFile(input.name, ".env"), { OPENROUTER_API_KEY: key });
      return `OpenRouter key set (${key.length} chars).`;
    });
    if (!r.ok) { await markJob(jobId, { status: "error", failedStepKey: "write_openrouter" }); return; }
  }

  // Step 5 — set default model
  if (shouldRun("set_model")) {
    const r = await runStep(jobId, "set_model", async () => {
      const res = await runHermes(input.name, ["config", "set", "model.default", input.model], { timeoutMs: 10_000 });
      if (res.code !== 0) {
        throw new Error(`hermes config set failed (code ${res.code}): ${res.stderr || res.stdout}`);
      }
      return `model.default = ${input.model}`;
    });
    if (!r.ok) { await markJob(jobId, { status: "error", failedStepKey: "set_model" }); return; }
  }

  // Step 6 — start gateway (optional)
  if (shouldRun("start_gateway")) {
    const r = await runStep(jobId, "start_gateway", async () => {
      if (!input.startGateway) return "Skipped (start-after-create off).";
      const result = await startGateway(input.name);
      if (!result.ok) throw new Error(result.message);
      return result.message;
    });
    if (!r.ok) { await markJob(jobId, { status: "error", failedStepKey: "start_gateway" }); return; }
  }

  await markJob(jobId, { status: "completed", failedStepKey: undefined });
  await audit({
    action: "profile.wizard.complete",
    profile: input.name,
    jobId,
    cloneFrom: input.cloneFrom || null,
    startGateway: !!input.startGateway,
  });
}
