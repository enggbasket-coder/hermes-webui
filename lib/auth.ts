import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

export type Session = { authed?: boolean; activeProfile?: string };

const secret = process.env.SESSION_SECRET || "";
if (secret.length < 32 && process.env.NODE_ENV === "production") {
  console.warn("[hermes-webui] SESSION_SECRET should be >=32 chars in production.");
}

export const sessionOptions: SessionOptions = {
  password: secret.padEnd(32, "x"),
  cookieName: "hermes_webui_session",
  cookieOptions: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  },
};

export async function getSession() {
  return getIronSession<Session>(await cookies(), sessionOptions);
}

export async function verifyPassword(input: string): Promise<boolean> {
  const expected = process.env.AUTH_PASSWORD || "";
  if (!expected) return false;
  // Allow either plaintext (simple deployments) or bcrypt hash starting $2.
  if (expected.startsWith("$2")) return bcrypt.compare(input, expected);
  // Constant-time-ish comparison.
  if (input.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < input.length; i++) diff |= input.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
