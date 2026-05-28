"use client";
import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2, XCircle, AlertTriangle } from "lucide-react";
import clsx from "clsx";

export type JobStepView = {
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "error" | "interrupted";
  message?: string;
};

export type JobView = {
  id: string;
  status: "pending" | "running" | "completed" | "error" | "interrupted";
  steps: JobStepView[];
  failedStepKey?: string;
};

export function JobProgress({
  jobId,
  onComplete,
  onError,
}: {
  jobId: string;
  onComplete?: (job: JobView) => void;
  onError?: (job: JobView) => void;
}) {
  const [job, setJob] = useState<JobView | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [streamErr, setStreamErr] = useState<string | null>(null);

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${encodeURIComponent(jobId)}/stream`);
    es.addEventListener("job", (e: MessageEvent) => {
      const j = JSON.parse(e.data) as JobView;
      setJob(j);
    });
    es.addEventListener("end", (e: MessageEvent) => {
      const { status } = JSON.parse(e.data) as { status: string };
      es.close();
      if (status === "completed") {
        setTimeout(() => onComplete && job && onComplete(job), 0);
      } else if (status === "error" || status === "interrupted") {
        setTimeout(() => onError && job && onError(job), 0);
      }
    });
    es.addEventListener("error", () => {
      setStreamErr("connection lost — refresh to reconnect");
    });
    es.onerror = () => { /* network blip; the 'error' event above also fires */ };
    return () => es.close();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId]);

  // Fire callbacks once we land in a terminal state. (The handler above
  // closes the stream but at that moment `job` in the closure may be stale.)
  useEffect(() => {
    if (!job) return;
    if (job.status === "completed") onComplete?.(job);
    if (job.status === "error" || job.status === "interrupted") onError?.(job);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job?.status]);

  async function retry() {
    setRetrying(true);
    try {
      const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/retry`, { method: "POST" });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setStreamErr(j.error || `retry failed (${r.status})`);
      } else {
        // Reconnect to the stream by forcing this component to remount-ish.
        // Easiest: reload the page. But we can just rely on the live stream
        // to pick up the new status writes.
      }
    } finally {
      setRetrying(false);
    }
  }

  if (!job) {
    return (
      <div className="text-ink-dim text-sm flex items-center gap-2">
        <Loader2 size={14} className="animate-spin" /> Starting…
      </div>
    );
  }

  const terminal = job.status === "completed" || job.status === "error" || job.status === "interrupted";
  const isError = job.status === "error" || job.status === "interrupted";

  return (
    <div className="bg-bg-card border border-line rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <StatusBadge status={job.status} />
        <code className="text-xs text-ink-faint ml-auto">{jobId}</code>
      </div>

      <ol className="space-y-2">
        {job.steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            <StepIcon status={s.status} />
            <div className="flex-1 min-w-0">
              <div className="flex gap-2 items-baseline">
                <span className={clsx(
                  "text-sm",
                  s.status === "completed" && "text-ink-dim",
                  s.status === "running" && "text-ink",
                  s.status === "error" && "text-err",
                  s.status === "interrupted" && "text-warn",
                )}>{s.label}</span>
              </div>
              {s.message && (
                <div className={clsx(
                  "text-xs mt-0.5 font-mono",
                  s.status === "error" ? "text-err" : "text-ink-faint",
                )}>
                  {s.message}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>

      {streamErr && (
        <div className="text-xs text-warn flex items-center gap-1.5">
          <AlertTriangle size={12} /> {streamErr}
        </div>
      )}

      {terminal && isError && (
        <div className="pt-2 border-t border-line flex items-center gap-3">
          <button
            onClick={retry}
            disabled={retrying}
            className="inline-flex items-center gap-1.5 bg-accent text-bg px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-accent-hover disabled:opacity-50"
          >
            {retrying ? <Loader2 size={14} className="animate-spin" /> : null}
            Retry from failed step
          </button>
          <span className="text-xs text-ink-faint">
            Completed steps will be skipped.
          </span>
        </div>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: JobStepView["status"] }) {
  if (status === "completed") return <CheckCircle2 size={16} className="text-ok mt-0.5 shrink-0" />;
  if (status === "running")   return <Loader2 size={16} className="text-accent animate-spin mt-0.5 shrink-0" />;
  if (status === "error")     return <XCircle size={16} className="text-err mt-0.5 shrink-0" />;
  if (status === "interrupted") return <AlertTriangle size={16} className="text-warn mt-0.5 shrink-0" />;
  return <Circle size={16} className="text-ink-faint mt-0.5 shrink-0" />;
}

function StatusBadge({ status }: { status: JobView["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending:    { label: "Queued",     cls: "bg-bg-elev border-line text-ink-dim" },
    running:    { label: "Running",    cls: "bg-bg-elev border-accent/40 text-accent" },
    completed:  { label: "Completed",  cls: "bg-bg-elev border-ok/40 text-ok" },
    error:      { label: "Failed",     cls: "bg-bg-elev border-err/40 text-err" },
    interrupted:{ label: "Interrupted",cls: "bg-bg-elev border-warn/40 text-warn" },
  };
  const v = map[status] || map.pending;
  return (
    <span className={clsx("text-xs px-2 py-0.5 rounded-full border", v.cls)}>{v.label}</span>
  );
}
