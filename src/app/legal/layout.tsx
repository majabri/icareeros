import type { Metadata } from "next";
import { LegalSidenav } from "@/components/legal/LegalSidenav";

export const metadata: Metadata = {
  title: "Legal — iCareerOS",
  robots: { index: true, follow: true },
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:flex-row lg:px-8">
      <aside className="lg:w-64 lg:shrink-0">
        <h1 className="mb-4 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Legal
        </h1>
        <LegalSidenav />
      </aside>
      <main id="main-content" className="flex-1 max-w-3xl">
        {children}
      </main>
    </div>
  );
}
