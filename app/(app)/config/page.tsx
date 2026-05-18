import { Stub } from "@/components/Stub";
export default function Page() {
  return <Stub title="Config" hint="Safe editors for config.yaml and .env (secrets masked) per profile."
    cli="hermes -p <profile> config set KEY VALUE" />;
}
