import path from "node:path";

// HERMES_HOME is the *root* that contains a `profiles/` subdir. Each
// subdir of `profiles/` is one profile and mirrors the standard hermes
// root layout (config.yaml, SOUL.md, USER.md, MEMORY.md, sessions/,
// skills/, cron/, logs/, ...).
//
// NOTE: the upstream `hermes` CLI documents a `-p/--profile NAME` flag
// but does NOT document where profile data lives on disk. The convention
// above is a dashboard-side assumption. If a future Hermes release pins
// a different convention, change ONLY this file and `listProfiles()`
// in ./profiles.ts.

export const HERMES_HOME = process.env.HERMES_HOME || "/data/hermes";
export const HERMES_BIN = process.env.HERMES_BIN || "hermes";

export const profilesRoot = () => path.join(HERMES_HOME, "profiles");
export const profileDir = (name: string) => path.join(profilesRoot(), name);

// Files we read/write inside a profile.
export const profileFile = (name: string, rel: string) =>
  path.join(profileDir(name), rel);
