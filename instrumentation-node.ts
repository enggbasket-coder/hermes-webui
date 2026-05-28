// Node-only init code, imported dynamically from instrumentation.ts so that
// webpack does NOT bundle node:fs / node:child_process / etc. for the Edge
// runtime build. See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function nodeInit() {
  // Give the HTTP listener a moment to bind before we spawn anything heavy.
  setTimeout(async () => {
    // 1. Reap any jobs that were running when the container died. Without
    //    this, the UI would spin forever on stale "running" state.
    try {
      const { reapInterruptedJobs } = await import("@/lib/jobs");
      const n = await reapInterruptedJobs();
      if (n > 0) console.log(`[hermes-webui] marked ${n} stale job(s) as interrupted`);
    } catch (e) {
      console.error("[hermes-webui] job reaper failed:", e);
    }

    // 2. Restore gateways whose wanted-flag was set.
    try {
      const { restoreWantedGateways } = await import("@/lib/hermes/profiles");
      await restoreWantedGateways();
    } catch (e) {
      console.error("[hermes-webui] nodeInit restore failed:", e);
    }
  }, 1500);
}
