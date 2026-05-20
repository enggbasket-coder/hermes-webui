// Next.js calls register() once when the server starts (both dev and prod,
// both nodejs and edge runtimes). We only want the gateway-restore work in
// the nodejs runtime. The dynamic import is gated inside the runtime check
// so webpack does NOT pull node:* modules into the Edge bundle.

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { nodeInit } = await import("./instrumentation-node");
    await nodeInit();
  }
}
