"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function LogsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-ink-dim">Loading…</div>}>
      <LogsInner />
    </Suspense>
  );
}

function LogsInner() {
  const sp = useSearchParams();
  const profile = sp.get("profile") || "";
  const [file, setFile] = useState("gateway.log");
  const [lines, setLines] = useState<string[]>([]);
  const boxRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    if (!profile) return;
    setLines([]);
    const es = new EventSource(`/api/logs/${encodeURIComponent(profile)}/stream?file=${encodeURIComponent(file)}`);
    es.addEventListener("log", (e: MessageEvent) => {
      setLines((prev) => {
        const next = [...prev, (e.data as string).replace(/\\n/g, "\n")];
        return next.length > 2000 ? next.slice(-2000) : next;
      });
    });
    es.addEventListener("err", (e: MessageEvent) =>
      setLines((p) => [...p, `[err] ${(e.data as string).replace(/\\n/g, "\n")}`]),
    );
    es.addEventListener("end", () => es.close());
    es.onerror = () => es.close();
    return () => es.close();
  }, [profile, file]);

  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [lines]);

  if (!profile) return <div className="p-8 text-ink-dim">Select a profile from the sidebar.</div>;

  return (
    <div className="p-8 space-y-4 max-w-5xl">
      <header className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <code className="text-xs px-2 py-1 bg-bg-card border border-line rounded">{profile}</code>
        <select value={file} onChange={(e) => setFile(e.target.value)}
          className="ml-auto bg-bg-card border border-line rounded-lg px-2.5 py-1 text-sm">
          {["gateway.log", "agent.log", "update.log"].map((f) => <option key={f}>{f}</option>)}
        </select>
      </header>
      <pre ref={boxRef}
        className="bg-bg-card border border-line rounded-xl p-4 text-xs font-mono text-ink-dim whitespace-pre-wrap h-[70vh] overflow-auto">
{lines.join("\n") || "waiting for log output…"}
      </pre>
    </div>
  );
}
