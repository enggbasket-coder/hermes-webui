import fs from "node:fs/promises";
import path from "node:path";
import { profilesRoot, profileDir } from "./paths";
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

export async function getGatewayStatus(name: string): Promise<GatewayStatus> {
  // `hermes gateway status` is documented; output format is not, so we
  // inspect it heuristically and surface the raw text in the UI.
  const r = await runHermes(name, ["gateway", "status"], { timeoutMs: 5000 });
  const text = (r.stdout + "\n" + r.stderr).toLowerCase();
  const running = /running|active|started|online/.test(text) &&
                  !/not running|stopped|inactive/.test(text);
  return { running, raw: r.stdout || r.stderr };
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
