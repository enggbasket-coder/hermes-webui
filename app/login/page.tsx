"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const r = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: pw }),
    });
    setBusy(false);
    if (r.ok) router.replace("/");
    else setErr("Wrong password.");
  }

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm bg-bg-card border border-line rounded-2xl p-8 space-y-5">
        <div>
          <h1 className="text-xl font-semibold">Hermes WebUI</h1>
          <p className="text-ink-dim text-sm mt-1">Sign in to continue.</p>
        </div>
        <input
          type="password"
          autoFocus
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          placeholder="Password"
          className="w-full bg-bg-elev border border-line rounded-lg px-3 py-2 outline-none focus:border-accent"
        />
        {err && <div className="text-err text-sm">{err}</div>}
        <button
          disabled={busy || !pw}
          className="w-full bg-accent hover:bg-accent-hover disabled:opacity-50 text-bg font-medium rounded-lg py-2 transition"
        >
          {busy ? "Checking…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
