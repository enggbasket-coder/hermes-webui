import { Stub } from "@/components/Stub";
export default function Page() {
  return <Stub title="Skills" hint="Browse, search, install, and edit skills in the active profile."
    cli="hermes -p <profile> skills list | search TERM | install ORG/SKILL" />;
}
