"use client";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import {
  LayoutDashboard, MessagesSquare, Users, Sparkles, Brain,
  CalendarClock, Radio, ScrollText, Settings, FolderOpen, LogOut,
} from "lucide-react";
import { StatusDot } from "./StatusDot";

type ProfileLite = { name: string; gateway: { running: boolean }; model?: string };

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/chat", label: "Chat", icon: MessagesSquare },
  { href: "/profiles", label: "Profiles", icon: Users },
  { href: "/skills", label: "Skills", icon: Sparkles },
  { href: "/memory", label: "Memory", icon: Brain },
  { href: "/tasks", label: "Tasks & Cron", icon: CalendarClock },
  { href: "/gateways", label: "Gateways", icon: Radio },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/config", label: "Config", icon: Settings },
  { href: "/files", label: "Files", icon: FolderOpen },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const sp = useSearchParams();
  const activeProfile = sp.get("profile") || "";
  const [profiles, setProfiles] = useState<ProfileLite[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const r = await fetch("/api/profiles", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (alive) setProfiles(j.profiles);
      } catch {}
    };
    tick();
    const id = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  function switchProfile(name: string) {
    const url = new URL(window.location.href);
    if (name) url.searchParams.set("profile", name);
    else url.searchParams.delete("profile");
    router.push(url.pathname + url.search);
  }

  return (
    <aside className="w-64 shrink-0 border-r border-line bg-bg-elev flex flex-col h-screen sticky top-0">
      <div className="px-5 py-4 border-b border-line">
        <div className="font-semibold tracking-tight">Hermes <span className="text-accent">WebUI</span></div>
        <div className="text-xs text-ink-faint mt-0.5">mission control</div>
      </div>

      <div className="px-3 py-3 border-b border-line">
        <label className="text-[11px] uppercase tracking-wider text-ink-faint px-2">Active profile</label>
        <select
          value={activeProfile}
          onChange={(e) => switchProfile(e.target.value)}
          className="mt-1 w-full bg-bg-card border border-line rounded-lg px-2.5 py-1.5 text-sm outline-none focus:border-accent"
        >
          <option value="">— none —</option>
          {profiles.map((p) => (
            <option key={p.name} value={p.name}>{p.name}</option>
          ))}
        </select>
        <div className="mt-2 max-h-56 overflow-auto space-y-0.5">
          {profiles.map((p) => (
            <button
              key={p.name}
              onClick={() => switchProfile(p.name)}
              className={clsx(
                "w-full flex items-center gap-2 text-left px-2 py-1 rounded text-sm hover:bg-bg-card",
                p.name === activeProfile && "bg-bg-card",
              )}
            >
              <StatusDot ok={p.gateway.running} title={p.gateway.running ? "gateway up" : "gateway down"} />
              <span className="flex-1 truncate">{p.name}</span>
              {p.model && <span className="text-[10px] text-ink-faint truncate max-w-[6rem]">{p.model}</span>}
            </button>
          ))}
          {profiles.length === 0 && (
            <div className="text-xs text-ink-faint px-2 py-2">No profiles found.</div>
          )}
        </div>
      </div>

      <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-auto">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          const url = activeProfile ? `${href}?profile=${encodeURIComponent(activeProfile)}` : href;
          return (
            <Link
              key={href}
              href={url}
              className={clsx(
                "flex items-center gap-2.5 px-3 py-1.5 rounded-lg text-sm",
                active ? "bg-bg-card text-ink" : "text-ink-dim hover:bg-bg-card hover:text-ink",
              )}
            >
              <Icon size={16} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      <form action="/api/auth/logout" method="post" className="p-3 border-t border-line">
        <button className="w-full flex items-center gap-2 text-sm text-ink-dim hover:text-err">
          <LogOut size={14} /> Sign out
        </button>
      </form>
    </aside>
  );
}
