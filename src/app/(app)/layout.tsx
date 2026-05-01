import { AppSidebar } from "@/components/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-gray-50">
      <AppSidebar />
      <main
        id="main-content"
        tabIndex={-1}
        className="flex-1 min-w-0 overflow-y-auto outline-none"
      >
        {children}
      </main>
    </div>
  );
}
