import { listProfiles } from "@/lib/hermes/profiles";
import { StatusDot } from "@/components/StatusDot";
import Link from "next/link";
import { HERMES_HOME } from "@/lib/hermes/paths";
import { Wand2 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardHome() {
  const profiles = await listProfiles();
  const running = profiles.filter((p) => p.gateway.running).length;
  const totalSkills = profiles.reduce((s, p) => s + p.skillCount, 0);
  const totalSessions = profiles.reduce((s, p) => s + p.sessionCount, 0);

  return (
    <div className="p-8 space-y-8">
      <header className="flex items-start gap-4">
        <div className="flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-ink-dim text-sm mt-1">
            {profiles.length} profile{profiles.length === 1 ? "" : "s"} discovered in{" "}
            <code className="font-mono text-xs">{HERMES_HOME}/profiles</code>
          </p>
        </div>
        <Link
          href="/profiles/new"
          className="inline-flex items-center gap-1.5 bg-accent text-bg font-medium px-3 py-2 rounded-lg hover:bg-accent-hover"
        >
          <Wand2 size={14} /> New profile
        </Link>
      </header>

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Profiles" value={profiles.length} />
        <Stat label="Gateways running" value={`${running} / ${profiles.length}`} />
        <Stat label="Skills" value={totalSkills} />
        <Stat label="Sessions" value={totalSessions} />
      </section>

      <section>
        <h2 className="text-sm uppercase tracking-wider text-ink-faint mb-3">Profiles</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {profiles.map((p) => (
            <Link
              key={p.name}
              href={`/gateways?profile=${encodeURIComponent(p.name)}`}
              className="block bg-bg-card border border-line rounded-xl p-4 hover:border-accent transition"
            >
              <div className="flex items-center gap-2">
                <StatusDot ok={p.gateway.running} />
                <div className="font-medium">{p.name}</div>
                {p.hasTelegram && (
                  <span className="ml-auto text-[10px] bg-bg-elev border border-line rounded px-1.5 py-0.5 text-ink-dim">
                    telegram
                  </span>
                )}
              </div>
              <div className="text-xs text-ink-faint mt-2 grid grid-cols-3 gap-2">
                <div><div className="text-ink">{p.model || "—"}</div>model</div>
                <div><div className="text-ink">{p.skillCount}</div>skills</div>
                <div><div className="text-ink">{p.sessionCount}</div>sessions</div>
              </div>
            </Link>
          ))}
          {profiles.length === 0 && (
            <div className="col-span-full text-ink-dim text-sm border border-dashed border-line rounded-xl p-6">
              No profiles found. Create one from the <Link href="/profiles" className="text-accent underline">Profiles</Link> tab,
              or mount your existing Hermes data at <code className="font-mono text-xs">{HERMES_HOME}</code>.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-bg-card border border-line rounded-xl p-4">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-ink-faint mt-1">{label}</div>
    </div>
  );
}
