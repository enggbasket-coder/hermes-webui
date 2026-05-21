import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
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

// Find gateway processes by walking /proc directly.
//
// Earlier versions of this code used `execSync("pgrep -f ...")`. That goes
// through /bin/sh -c, which produces a shell process whose argv CONTAINS the
// search pattern as a substring. pgrep then matched the shell itself,
// returning a stale PID that disappeared the instant the call completed —
// causing the dashboard to permanently report "already running" and refuse
// to spawn a real gateway.
//
// Walking /proc directly avoids both the self-match problem and any external
// command invocation. We match argv exactly: argv[0] must be a path ending in
// "hermes", followed by `-p <profile> gateway run`.
function findGatewayPids(profile: string): number[] {
  const pids: number[] = [];
  let entries: string[] = [];
  try { entries = fsSync.readdirSync("/proc"); } catch { return pids; }
  for (const entry of entries) {
    if (!/^\d+$/.test(entry)) continue;
    let cmdline: string;
    try {
      cmdline = fsSync.readFileSync(`/proc/${entry}/cmdline`, "utf8");
    } catch { continue; /* process exited between readdir and now */ }
    const args = cmdline.split("\0").filter(Boolean);
    if (args.length < 5) continue;
    // The running gateway's cmdline depends on wrapper chain:
    //   Direct binary:  /usr/local/bin/hermes -p testbot gateway run
    //   Via venv shebang: /…/python3 /…/hermes -p testbot gateway run
    // So we scan for the sequence `<…/hermes> -p <profile> gateway run`
    // starting at any argv index. This matches both cases and ignores
    // anything else (shells, our own dashboard process, etc.) because the
    // exact 5-arg sequence with 'hermes' basename only appears in real
    // hermes invocations.
    for (let i = 0; i + 4 < args.length; i++) {
      if (path.basename(args[i]) === "hermes" &&
          args[i + 1] === "-p" &&
          args[i + 2] === profile &&
          args[i + 3] === "gateway" &&
          args[i + 4] === "run") {
        pids.push(parseInt(entry, 10));
        break;
      }
    }
  }
  return pids;
}

export async function getGatewayStatus(name: string): Promise<GatewayStatus> {
  const pids = findGatewayPids(name);
  if (pids.length > 0) {
    return { running: true, raw: `gateway running (pid ${pids[0]})` };
  }
  return { running: false, raw: "stopped" };
}

// ---------------------------------------------------------------------------
// Persistent "wanted state" flag.
//
// When you click Start in the dashboard, we write a marker file inside the
// profile's directory. On container boot, instrumentation.ts walks all
// profiles and restarts any with the marker set. This way intent survives
// container restarts, VPS reboots, image rebuilds, etc — without coupling
// us to systemd or external schedulers.
// ---------------------------------------------------------------------------

function wantedFile(name: string) {
  return profileFile(name, ".gateway-wanted");
}

export function isGatewayWanted(name: string): boolean {
  try {
    fsSync.accessSync(wantedFile(name), fsSync.constants.F_OK);
    return true;
  } catch { return false; }
}

async function markGatewayWanted(name: string, wanted: boolean) {
  const f = wantedFile(name);
  if (wanted) {
    await fs.mkdir(path.dirname(f), { recursive: true });
    await fs.writeFile(f, new Date().toISOString() + "\n");
  } else {
    try { await fs.unlink(f); } catch { /* already gone */ }
  }
}

export type GatewayActionResult = {
  ok: boolean;
  pid?: number;
  message: string;
  status: GatewayStatus;
};

export async function startGateway(name: string): Promise<GatewayActionResult> {
  // Always record user intent — even if the process happens to already be
  // alive (e.g. just auto-restored). Clicking Start means "I want this
  // running across reboots", regardless of current state.
  await markGatewayWanted(name, true);

  const existing = findGatewayPids(name);
  if (existing.length > 0) {
    return {
      ok: true,
      pid: existing[0],
      message: `Already running (pid ${existing.join(", ")}). Auto-restart ensured.`,
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
  // Record user intent so the gateway is auto-restarted on container reboot.
  await markGatewayWanted(name, true);
  return {
    ok: true,
    pid: alive[0],
    message: `Started (pid ${alive[0]}). Output streaming to logs/gateway.log.`,
    status: { running: true, raw: `running (pid ${alive[0]})` },
  };
}

export async function stopGateway(name: string): Promise<GatewayActionResult> {
  // User explicitly asked to stop — clear the auto-restart flag.
  await markGatewayWanted(name, false);
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

// Called once at Next.js server startup (see instrumentation.ts). Scans every
// profile, and for any with the wanted-state flag set, spawns its gateway.
// Errors are logged but do not block startup of other profiles or the
// dashboard itself.
export async function restoreWantedGateways(): Promise<void> {
  let names: string[];
  try { names = await listProfileNames(); }
  catch (e) {
    console.warn("[hermes-webui] restoreWantedGateways: cannot list profiles:", e);
    return;
  }
  const wanted = names.filter(isGatewayWanted);
  if (wanted.length === 0) {
    console.log("[hermes-webui] no gateways flagged for auto-restart");
    return;
  }
  console.log(`[hermes-webui] restoring ${wanted.length} gateway(s): ${wanted.join(", ")}`);
  for (const name of wanted) {
    try {
      const r = await startGateway(name);
      console.log(`[hermes-webui] ${name}: ${r.message}`);
    } catch (e) {
      console.error(`[hermes-webui] ${name}: failed to restore:`, e);
    }
  }
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
