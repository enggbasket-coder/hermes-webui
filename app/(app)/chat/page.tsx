import { Stub } from "@/components/Stub";
export default function Page() {
  return <Stub title="Chat" hint="Streaming chat composer with tool-call visualization. Will wrap hermes chat -q and persist sessions/."
    cli="hermes -p <profile> chat -q '...'" />;
}
