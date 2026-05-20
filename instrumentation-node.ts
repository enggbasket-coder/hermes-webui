// Node-only init code, imported dynamically from instrumentation.ts so that
// webpack does NOT bundle node:fs / node:child_process / etc. for the Edge
// runtime build. See https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function nodeInit() {
  // Give the HTTP listener a moment to bind before we spawn anything heavy.
  setTimeout(async () => {
    try {
      const { restoreWantedGateways } = await import("@/lib/hermes/profiles");
      await restoreWantedGateways();
    } catch (e) {
      console.error("[hermes-webui] nodeInit restore failed:", e);
    }
  }, 1500);
}
