import { readJob, redactJob } from "@/lib/jobs";

export const dynamic = "force-dynamic";

// SSE that re-reads the job file and pushes whenever updatedAt changes. Cheap
// (250ms poll interval, sub-KB JSON), simpler than fs.watch which is finicky
// across bind mounts and Docker.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastUpdated = "";
      let closed = false;
      const closeOnAbort = () => { closed = true; };
      req.signal.addEventListener("abort", closeOnAbort);

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      // Initial push immediately
      while (!closed) {
        const job = await readJob(id);
        if (!job) {
          send("error", { error: "not found" });
          break;
        }
        if (job.updatedAt !== lastUpdated) {
          lastUpdated = job.updatedAt;
          send("job", redactJob(job));
        }
        if (job.status === "completed" || job.status === "error" || job.status === "interrupted") {
          send("end", { status: job.status });
          break;
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      try { controller.close(); } catch {}
    },
    cancel() { /* no-op; abort handler sets closed */ },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
    },
  });
}
