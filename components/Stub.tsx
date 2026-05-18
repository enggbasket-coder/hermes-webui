import Link from "next/link";

export function Stub({ title, hint, cli }: { title: string; hint: string; cli?: string }) {
  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-ink-dim mt-2">{hint}</p>
      {cli && (
        <div className="mt-4 p-4 bg-bg-card border border-line rounded-xl text-sm">
          <div className="text-xs uppercase tracking-wider text-ink-faint mb-2">Underlying CLI</div>
          <code className="font-mono text-ink">{cli}</code>
        </div>
      )}
      <p className="text-xs text-ink-faint mt-6">
        Not yet wired in this build. See <Link href="/" className="text-accent underline">dashboard</Link>.
      </p>
    </div>
  );
}
