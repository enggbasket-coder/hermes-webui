import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { execSync, spawn } from "node:child_process";
import { profilesRoot, profileDir, profileFile, HERMES_BIN, HERMES_HOME } from "./paths";
import { runHermes } from "./cli";

export type Profile = {
  name: string;
  path: string;
  model?: string;
  skillCount: number;
  sessionCount: number;
  hasTelegram: boolean;
  gateway: GatewayStatus;
};

export type GatewayStatus = {
  running: boolean;
  raw: string; // raw `hermes gateway status` output for the inspector
};

async function pathExists(p: string) {
  try { await fs.stat(p); return true; } catch { return false; }
}

async function countDirEntries(p: string) {
  try {
    const entries = await fs.readdir(p, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).length;
  } catch { return 0; }
}

async function readModelFromConfig(profilePath: string): Promise<string | undefined> {
  const cfg = path.join(profilePath, "config.yaml");
  try {
    const txt = await fs.readFile(cfg, "utf8");
    // Cheap yaml peek; avoid pulling a yaml dep just for this.
    const m = txt.match(/^\s*default\s*:\s*([^\s#]+)/m) ||
              txt.match(/model\.default\s*:\s*([^\s#]+)/m);
    return m?.[1];
  } catch { return undefined; }
}

async function detectTelegram(profilePath: string): Promise<boolean> {
  try {
    const txt = await fs.readFile(path.join(profilePath, "config.yaml"), "utf8");
    return /telegram\s*:/i.test(txt);
  } catch { return false; }
}

export async function listProfileNames(): Promise<string[]> {
  const root = profilesRoot();
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

export async function getProfile(name: string): Promise<Profile | null> {
  const dir = profileDir(name);
  if (!(await pathExists(dir))) return null;
  const [model, skillCount, sessionCount, hasTelegram, gateway] = await Promise.all([
    readModelFromConfig(dir),
    countDirEntries(path.join(dir, "skills")),
    countDirEntries(path.join(dir, "sessions")),
    detectTelegram(dir),
    getGatewayStatus(name),
  ]);
  return { name, path: dir, model, skillCount, sessionCount, hasTelegram, gateway };
}

export async function listProfiles(): Promise<Profile[]> {
  const names = await listProfileNames();
  return (await Promise.all(names.map(getProfile))).filter((p): p is Profile => !!p);
}

// ---------------------------------------------------------------------------
// Gateway lifecycle.
//
// Hermes refuses `gateway start` inside a Docker container ("not applicable")
// because it expects to register a systemd unit. The container-friendly path
// is `gateway run`, which polls in the foreground. We spawn it DETACHED so it
// survives:
//   - the API request returning,
//   - the user closing the dashboard tab,
//   - the user closing their SSH/browser-terminal session.
// We then track it by pgrep on the exact argv pattern, which is more reliable
// than a PID file (PID files get stale; pgrep is real-time).
// ---------------------------------------------------------------------------

function gatewayPattern(profile: string) {
  // Matches the argv we spawn. Anchored to avoid false positives.
  return `${HERMES_BIN} -p ${profile} gateway run`;
}

function findGatewayPids(profile: string): number[] {
  try {
    const out = execSync(`pgrep -f "${gatewayPattern(profile)}"`, {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    });
    return out.trim().split("\n").filter(Boolean).map((s) => parseInt(s, 10));
  } catch {
    return []; // pgrep exits 1 when no match
  }
}

export async function getGatewayStatus(name: string): Promise<GatewayStatus> {
  const pids = findGatewayPids(name);
  if (pids.length > 0) {
    return { running: true, raw: `gateway running (pid ${pids[0]})` };
  }
  return { running: false, raw: "stopped" };
}

export type GatewayActionResult = {
  ok: boolean;
  pid?: number;
  message: string;
  status: GatewayStatus;
};

export async function startGateway(name: string): Promise<GatewayActionResult> {
  const existing = findGatewayPids(name);
  if (existing.length > 0) {
    return {
      ok: false,
      pid: existing[0],
      message: `Already running (pid ${existing.join(", ")}).`,
      status: { running: true, raw: `running (pid ${existing[0]})` },
    };
  }
  // Make sure logs/ exists; redirect stdout+stderr there so the Logs tab
  // shows real-time gateway output.
  const logDir = profileFile(name, "logs");
  await fs.mkdir(logDir, { recursive: true });
  const logPath = path.join(logDir, "gateway.log");
  const fd = fsSync.openSync(logPath, "a");
  fsSync.writeSync(fd, `\n=== gateway started ${new Date().toISOString()} ===\n`);

  const child = spawn(HERMES_BIN, ["-p", name, "gateway", "run"], {
    env: { ...process.env, HERMES_HOME },
    stdio: ["ignore", fd, fd],
    detached: true,
  });
  child.unref(); // let event loop exit even if child is alive

  // Brief grace period so we can detect an immediate crash (bad config etc).
  await new Promise((r) => setTimeout(r, 1500));
  const alive = findGatewayPids(name);
  if (alive.length === 0) {
    return {
      ok: false,
      message: "Process exited immediately — check Logs tab (gateway.log).",
      status: { running: false, raw: "failed to start" },
    };
  }
  return {
    ok: true,
    pid: alive[0],
    message: `Started (pid ${alive[0]}). Output streaming to logs/gateway.log.`,
    status: { running: true, raw: `running (pid ${alive[0]})` },
  };
}

export async function stopGateway(name: string): Promise<GatewayActionResult> {
  const pids = findGatewayPids(name);
  if (pids.length === 0) {
    return {
      ok: true,
      message: "Not running.",
      status: { running: false, raw: "stopped" },
    };
  }
  for (const pid of pids) {
    try { process.kill(pid, "SIGTERM"); } catch {}
  }
  // Give it 3s to shut down cleanly, then SIGKILL anything still alive.
  await new Promise((r) => setTimeout(r, 3000));
  const stillAlive = findGatewayPids(name);
  for (const pid of stillAlive) {
    try { process.kill(pid, "SIGKILL"); } catch {}
  }
  return {
    ok: true,
    message: `Stopped ${pids.length} process${pids.length === 1 ? "" : "es"}.`,
    status: { running: false, raw: "stopped" },
  };
}

export async function restartGateway(name: string): Promise<GatewayActionResult> {
  await stopGateway(name);
  await new Promise((r) => setTimeout(r, 1000));
  return startGateway(name);
}

export async function createProfile(name: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(name)) {
    throw new Error("Profile name must be alphanumeric, dash, underscore (1-41 chars).");
  }
  const dir = profileDir(name);
  if (await pathExists(dir)) throw new Error(`Profile "${name}" already exists.`);
  await fs.mkdir(path.join(dir, "skills"), { recursive: true });
  await fs.mkdir(path.join(dir, "sessions"), { recursive: true });
  await fs.mkdir(path.join(dir, "cron"), { recursive: true });
  await fs.mkdir(path.join(dir, "logs"), { recursive: true });
  await fs.writeFile(path.join(dir, "config.yaml"), "# Hermes profile config\n");
  await fs.writeFile(path.join(dir, ".env"), "# Secrets for this profile\n", { mode: 0o600 });
}

export async function deleteProfile(name: string): Promise<void> {
  await fs.rm(profileDir(name), { recursive: true, force: true });
}

export async function renameProfile(oldName: string, newName: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9_-]{0,40}$/i.test(newName)) throw new Error("Invalid name.");
  const dst = profileDir(newName);
  if (await pathExists(dst)) throw new Error(`"${newName}" already exists.`);
  await fs.rename(profileDir(oldName), dst);
}
