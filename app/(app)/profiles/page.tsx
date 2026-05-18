"use client";
import { useEffect, useState } from "react";
import { StatusDot } from "@/components/StatusDot";
import { Trash2, Plus, Pencil } from "lucide-react";

type P = { name: string; model?: string; skillCount: number; sessionCount: number; gateway: { running: boolean } };

export default function ProfilesPage() {
  const [profiles, setProfiles] = useState<P[]>([]);
  const [newName, setNewName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const r = await fetch("/api/profiles", { cache: "no-store" });
    const j = await r.json();
    setProfiles(j.profiles || []);
  }
  useEffect(() => { refresh(); }, []);

  async function create() {
    setErr(null); setBusy(true);
    const r = await fetch("/api/profiles", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: newName }),
    });
    setBusy(false);
    if (!r.ok) { setErr((await r.json()).error || "failed"); return; }
    setNewName(""); refresh();
  }
  async function remove(name: string) {
    if (!confirm(`Delete profile "${name}"? This removes its directory.`)) return;
    await fetch(`/api/profiles/${encodeURIComponent(name)}`, { method: "DELETE" });
    refresh();
  }
  async function rename(name: string) {
    const next = prompt(`Rename "${name}" to:`, name);
    if (!next || next === name) return;
    const r = await fetch(`/api/profiles/${encodeURIComponent(name)}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ rename: next }),
    });
    if (!r.ok) alert((await r.json()).error);
    refresh();
  }

  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Profiles</h1>
        <p className="text-ink-dim text-sm mt-1">Create, rename, or delete Hermes profiles.</p>
      </header>

      <div className="flex gap-2">
        <input
          value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="new-profile-name"
          className="flex-1 bg-bg-card border border-line rounded-lg px-3 py-2 outline-none focus:border-accent"
        />
        <button
          onClick={create} disabled={!newName || busy}
          className="inline-flex items-center gap-1.5 bg-accent text-bg px-3 py-2 rounded-lg disabled:opacity-50 hover:bg-accent-hover"
        >
          <Plus size={14} /> Create
        </button>
      </div>
      {err && <div className="text-err text-sm">{err}</div>}

      <ul className="divide-y divide-line border border-line rounded-xl overflow-hidden bg-bg-card">
        {profiles.map((p) => (
          <li key={p.name} className="flex items-center gap-3 px-4 py-3">
            <StatusDot ok={p.gateway.running} />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{p.name}</div>
              <div className="text-xs text-ink-faint">
                {p.model || "no model"} · {p.skillCount} skills · {p.sessionCount} sessions
              </div>
            </div>
            <button onClick={() => rename(p.name)} className="p-1.5 text-ink-dim hover:text-ink" title="Rename">
              <Pencil size={15} />
            </button>
            <button onClick={() => remove(p.name)} className="p-1.5 text-ink-dim hover:text-err" title="Delete">
              <Trash2 size={15} />
            </button>
          </li>
        ))}
        {profiles.length === 0 && <li className="px-4 py-6 text-ink-dim text-sm">No profiles yet.</li>}
      </ul>
    </div>
  );
}
