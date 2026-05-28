"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { JobProgress } from "@/components/JobProgress";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type Existing = { name: string };

const MODEL_PRESETS = [
  { id: "anthropic/claude-haiku-4.5",    label: "Claude Haiku 4.5 (cheap, fast)" },
  { id: "anthropic/claude-sonnet-4.6",   label: "Claude Sonnet 4.6 (default)" },
  { id: "anthropic/claude-opus-4.7",     label: "Claude Opus 4.7 (premium)" },
  { id: "openai/gpt-5.5",                label: "GPT-5.5" },
  { id: "deepseek/deepseek-chat",        label: "DeepSeek Chat (cheapest)" },
];

export default function NewProfilePage() {
  return <NewProfileInner />;
}

function NewProfileInner() {
  const router = useRouter();
  const [existing, setExisting] = useState<Existing[]>([]);

  // Form state
  const [name, setName] = useState("");
  const [cloneFrom, setCloneFrom] = useState("");
  const [model, setModel] = useState(MODEL_PRESETS[0].id);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [telegramAllowedUsers, setTelegramAllowedUsers] = useState("8723310096");
  const [openrouterApiKey, setOpenrouterApiKey] = useState("");
  const [startGateway, setStartGateway] = useState(true);
  const [showToken, setShowToken] = useState(false);
  const [showKey, setShowKey] = useState(false);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/profiles", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => setExisting((j.profiles || []).map((p: any) => ({ name: p.name }))))
      .catch(() => {});
  }, []);

  const nameValid = /^[a-z0-9][a-z0-9_-]{0,40}$/i.test(name);
  const nameTaken = existing.some((p) => p.name.toLowerCase() === name.toLowerCase());
  const usersValid =
    telegramAllowedUsers.split(",").map((s) => s.trim()).filter(Boolean).every((u) => /^\d{5,15}$/.test(u));
  const tokenLooksOk = /^\d{8,12}:[A-Za-z0-9_-]{30,}$/.test(telegramBotToken);
  const formValid = nameValid && !nameTaken && usersValid && tokenLooksOk;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSubmitting(true);
    try {
      const r = await fetch("/api/profiles/wizard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          cloneFrom: cloneFrom || null,
          model,
          telegramBotToken,
          telegramAllowedUsers,
          openrouterApiKey,
          startGateway,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        setFormError(j.error === "validation" ? "Server rejected the form (check fields)." : (j.error || `HTTP ${r.status}`));
        setSubmitting(false);
        return;
      }
      const j = await r.json();
      setJobId(j.jobId as string);
    } catch (e: any) {
      setFormError(String(e?.message || e));
      setSubmitting(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl space-y-6">
      <div>
        <Link href="/profiles" className="inline-flex items-center gap-1 text-ink-dim hover:text-ink text-sm">
          <ArrowLeft size={14} /> Profiles
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight mt-2">New profile</h1>
        <p className="text-ink-dim text-sm mt-1">
          Provisions a Hermes profile with a Telegram gateway in one shot.
        </p>
      </div>

      {!jobId && (
        <form onSubmit={submit} className="space-y-5">
          {/* Profile name */}
          <Field label="Profile name" hint="lowercase letters, digits, dash, underscore (1–41 chars)">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. marketbot"
              className="w-full bg-bg-card border border-line rounded-lg px-3 py-2 outline-none focus:border-accent"
              autoFocus
              disabled={submitting}
            />
            {name && !nameValid && (
              <div className="text-xs text-err mt-1">Invalid characters or length.</div>
            )}
            {name && nameValid && nameTaken && (
              <div className="text-xs text-err mt-1">A profile with this name already exists.</div>
            )}
          </Field>

          {/* Clone from */}
          {existing.length > 0 && (
            <Field label="Clone from (optional)" hint="Start from a copy of an existing profile's files">
              <select
                value={cloneFrom}
                onChange={(e) => setCloneFrom(e.target.value)}
                disabled={submitting}
                className="w-full bg-bg-card border border-line rounded-lg px-3 py-2 outline-none focus:border-accent"
              >
                <option value="">— don't clone (fresh profile) —</option>
                {existing.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Model */}
          <Field label="Default model" hint="Used for chat unless overridden per-task">
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={submitting}
              className="w-full bg-bg-card border border-line rounded-lg px-3 py-2 outline-none focus:border-accent"
            >
              {MODEL_PRESETS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </Field>

          {/* Telegram bot token */}
          <Field
            label="Telegram bot token"
            hint="From @BotFather. Will be live-validated against Telegram before we start anything."
          >
            <div className="relative">
              <input
                value={telegramBotToken}
                onChange={(e) => setTelegramBotToken(e.target.value.trim())}
                type={showToken ? "text" : "password"}
                placeholder="123456789:ABC-DEF..."
                disabled={submitting}
                className="w-full bg-bg-card border border-line rounded-lg px-3 py-2 pr-16 outline-none focus:border-accent font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowToken((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint hover:text-ink px-2"
              >
                {showToken ? "hide" : "show"}
              </button>
            </div>
            {telegramBotToken && !tokenLooksOk && (
              <div className="text-xs text-err mt-1">
                Doesn't match the Telegram bot token format.
              </div>
            )}
          </Field>

          {/* Allowed users */}
          <Field
            label="Allowed Telegram user IDs"
            hint="Comma-separated numeric user IDs. Get yours via @userinfobot."
          >
            <input
              value={telegramAllowedUsers}
              onChange={(e) => setTelegramAllowedUsers(e.target.value)}
              placeholder="12345678,87654321"
              disabled={submitting}
              className="w-full bg-bg-card border border-line rounded-lg px-3 py-2 outline-none focus:border-accent font-mono text-sm"
            />
            {telegramAllowedUsers && !usersValid && (
              <div className="text-xs text-err mt-1">Each entry must be a numeric ID (5–15 digits).</div>
            )}
          </Field>

          {/* OpenRouter key (optional) */}
          <Field
            label="OpenRouter API key (optional)"
            hint="Leave blank to inherit from the default profile."
          >
            <div className="relative">
              <input
                value={openrouterApiKey}
                onChange={(e) => setOpenrouterApiKey(e.target.value.trim())}
                type={showKey ? "text" : "password"}
                placeholder="sk-or-v1-..."
                disabled={submitting}
                className="w-full bg-bg-card border border-line rounded-lg px-3 py-2 pr-16 outline-none focus:border-accent font-mono text-sm"
              />
              <button
                type="button"
                onClick={() => setShowKey((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-ink-faint hover:text-ink px-2"
              >
                {showKey ? "hide" : "show"}
              </button>
            </div>
          </Field>

          {/* Start gateway */}
          <label className="flex items-center gap-2 text-sm select-none">
            <input
              type="checkbox"
              checked={startGateway}
              onChange={(e) => setStartGateway(e.target.checked)}
              disabled={submitting}
              className="rounded border-line"
            />
            <span>Start the Telegram gateway immediately after creation</span>
          </label>

          {formError && (
            <div className="text-err text-sm bg-bg-card border border-err/40 rounded-lg px-3 py-2">
              {formError}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={!formValid || submitting}
              className="inline-flex items-center gap-2 bg-accent text-bg font-medium px-4 py-2 rounded-lg hover:bg-accent-hover disabled:opacity-50"
            >
              Create profile
            </button>
            <Link href="/profiles" className="text-sm text-ink-dim hover:text-ink">
              Cancel
            </Link>
          </div>
        </form>
      )}

      {jobId && (
        <JobProgress
          jobId={jobId}
          onComplete={() => router.push(`/gateways?profile=${encodeURIComponent(name)}`)}
        />
      )}
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink mb-1">{label}</label>
      {children}
      {hint && <div className="text-xs text-ink-faint mt-1">{hint}</div>}
    </div>
  );
}
