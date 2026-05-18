import { Stub } from "@/components/Stub";
export default function Page() {
  return <Stub title="Tasks & Cron" hint="Manage scheduled jobs and view the Hermes kanban board per profile."
    cli="hermes -p <profile> cron list | add" />;
}
