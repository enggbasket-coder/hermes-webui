"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { StatusDot } from "@/components/StatusDot";
import { Play, Square, RotateCw, RefreshCw } from "lucide-react";

type Status = { running: boolean; raw: string };

export default function GatewaysPage() {
  return (
    <Suspense fallback={<div className="p-8 text-ink-dim">Loading…</div>}>
      <GatewaysInner />
    </Suspense>
  );
}

function GatewaysInner() {
  const sp = useSearchParams();
  const profile = sp.get("profile") || "";
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [output, setOutput] = useState<string>("");

  async function refresh() {
    if (!profile) return;
    const r = await fetch(`/api/gateways/${encodeURIComponent(profile)}`, { cache: "no-store" });
    setStatus((await r.json()).status);
  }
  async function act(action: "start" | "stop" | "restart") {
    if (!profile) return;
    setBusy(action);
    const r = await fetch(`/api/gateways/${encodeURIComponent(profile)}`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const j = await r.json();
    setBusy(null);
    setStatus(j.status);
    setOutput((j.stdout || "") + (j.stderr ? "\n[stderr]\n" + j.stderr : ""));
  }

  useEffect(() => { refresh(); }, [profile]);

  if (!profile) {
    return <Empty msg="Select a profile from the sidebar to manage its gateway." />;
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Gateway</h1>
        <code className="text-xs px-2 py-1 bg-bg-card border border-line rounded">{profile}</code>
        <button onClick={refresh} className="ml-auto p-1.5 text-ink-dim hover:text-ink" title="Refresh">
          <RefreshCw size={15} />
        </button>
      </header>

      <div className="bg-bg-card border border-line rounded-xl p-5">
        <div className="flex items-center gap-3">
          <StatusDot ok={!!status?.running} />
          <div className="text-lg">{status?.running ? "Running" : "Stopped"}</div>
        </div>
        <div className="mt-4 flex gap-2">
          <Btn icon={<Play size={14} />} label="Start" onClick={() => act("start")}  disabled={busy !== null || status?.running} />
          <Btn icon={<Square size={14} />} label="Stop" onClick={() => act("stop")} disabled={busy !== null || !status?.running} variant="warn" />
          <Btn icon={<RotateCw size={14} />} label="Restart" onClick={() => act("restart")} disabled={busy !== null} variant="ghost" />
          {busy && <span className="text-sm text-ink-dim self-center">{busy}…</span>}
        </div>
      </div>

      {(status?.raw || output) && (
        <pre className="bg-bg-card border border-line rounded-xl p-4 text-xs font-mono text-ink-dim whitespace-pre-wrap max-h-80 overflow-auto">
{output || status?.raw}
        </pre>
      )}

      <p className="text-xs text-ink-faint">
        Calls <code className="font-mono">hermes -p {profile} gateway &lt;action&gt;</code>.
        Configure platforms with <code className="font-mono">hermes -p {profile} gateway setup</code> on the host.
      </p>
    </div>
  );
}

function Btn({ icon, label, onClick, disabled, variant = "primary" }: any) {
  const styles = {
    primary: "bg-accent text-bg hover:bg-accent-hover",
    warn: "bg-bg-elev border border-line text-warn hover:bg-bg-card",
    ghost: "bg-bg-elev border border-line text-ink-dim hover:text-ink",
  } as const;
  return (
    <button onClick={onClick} disabled={disabled}
      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm disabled:opacity-40 ${styles[variant as keyof typeof styles]}`}>
      {icon}{label}
    </button>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div className="p-8 text-ink-dim">{msg}</div>;
}
