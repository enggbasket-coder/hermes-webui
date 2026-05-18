import { Sidebar } from "@/components/Sidebar";
import { Suspense } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <Suspense>
        <Sidebar />
      </Suspense>
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
