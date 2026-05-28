import { NextResponse } from "next/server";
import { z } from "zod";
import { buildWizardJob, runWizard, type WizardInput } from "@/lib/hermes/wizard";
import { newJobId, writeJob, audit } from "@/lib/jobs";

export const dynamic = "force-dynamic";

// Server-side schema. Client validates loosely (UX), server validates strictly.
const schema = z.object({
  name: z.string().min(1).max(41).regex(/^[a-z0-9][a-z0-9_-]{0,40}$/i),
  cloneFrom: z.string().min(1).max(41).regex(/^[a-z0-9][a-z0-9_-]{0,40}$/i).nullable().optional(),
  model: z.string().min(1).max(120),
  telegramBotToken: z.string().min(20).max(120),
  telegramAllowedUsers: z.string().min(5).max(200),
  openrouterApiKey: z.string().max(300).optional().default(""),
  startGateway: z.boolean().optional().default(true),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const input = parsed.data as WizardInput;
  const id = newJobId();
  const job = buildWizardJob(id, input);
  await writeJob(job);

  // Fire-and-forget. Next.js keeps the process alive between requests,
  // so void-ing the promise is enough. Don't await — return immediately
  // so the client gets the job id and can subscribe to SSE.
  void runWizard(id).catch((e) => {
    console.error(`[hermes-webui] wizard ${id} crashed:`, e);
  });

  await audit({
    action: "profile.wizard.start",
    profile: input.name,
    jobId: id,
  });

  return NextResponse.json({ jobId: id }, { status: 202 });
}
