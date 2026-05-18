import clsx from "clsx";
export function StatusDot({ ok, title }: { ok: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={clsx(
        "inline-block w-2 h-2 rounded-full",
        ok ? "bg-ok shadow-[0_0_6px_rgba(62,194,143,0.7)]" : "bg-err",
      )}
    />
  );
}
