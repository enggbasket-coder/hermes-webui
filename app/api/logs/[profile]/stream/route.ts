import { profileFile } from "@/lib/hermes/paths";
import { spawn } from "node:child_process";
import path from "node:path";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ profile: string }> }) {
  const { profile } = await params;
  const url = new URL(req.url);
  const file = url.searchParams.get("file") || "gateway.log";
  const safe = path.basename(file); // prevent traversal
  const target = profileFile(profile, path.join("logs", safe));

  const encoder = new TextEncoder();
  const tail = spawn("tail", ["-n", "200", "-F", target], { stdio: ["ignore", "pipe", "pipe"] });

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: string, event = "log") => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${data.replace(/\n/g, "\\n")}\n\n`));
      };
      tail.stdout.on("data", (b) => b.toString().split(/\r?\n/).forEach((l: string) => l && send(l)));
      tail.stderr.on("data", (b) => send(b.toString(), "err"));
      tail.on("close", () => { send("[stream closed]", "end"); controller.close(); });
      req.signal.addEventListener("abort", () => tail.kill("SIGTERM"));
    },
    cancel() { tail.kill("SIGTERM"); },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    },
  });
}
