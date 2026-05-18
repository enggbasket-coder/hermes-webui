import { spawn, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";
import { HERMES_BIN, HERMES_HOME } from "./paths";

export type CliResult = { code: number; stdout: string; stderr: string };

// Run a hermes CLI command for a given profile. Output is captured (small).
// For long-lived streams (logs, chat) use spawnHermes() instead.
export function runHermes(
  profile: string | null,
  args: string[],
  opts: { timeoutMs?: number } = {},
): Promise<CliResult> {
  const fullArgs = profile ? ["-p", profile, ...args] : args;
  return new Promise((resolve) => {
    const child = spawn(HERMES_BIN, fullArgs, {
      env: { ...process.env, HERMES_HOME },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = opts.timeoutMs
      ? setTimeout(() => child.kill("SIGTERM"), opts.timeoutMs)
      : null;
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr });
    });
    child.on("error", (e) => {
      if (timer) clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(e) });
    });
  });
}

export function spawnHermes(
  profile: string | null,
  args: string[],
): ChildProcessByStdio<null, Readable, Readable> {
  const fullArgs = profile ? ["-p", profile, ...args] : args;
  return spawn(HERMES_BIN, fullArgs, {
    env: { ...process.env, HERMES_HOME },
    stdio: ["ignore", "pipe", "pipe"],
  });
}
