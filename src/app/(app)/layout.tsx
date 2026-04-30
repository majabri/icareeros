import { AppNav } from "@/components/AppNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <AppNav />
      {/* pb-16 reserves space for the mobile bottom tab bar (sm:pb-0 removes it on larger screens) */}
      <main id="main-content" tabIndex={-1} className="outline-none pb-16 sm:pb-0">
        {children}
      </main>
    </div>
  );
}
