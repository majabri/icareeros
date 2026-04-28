import type { Metadata } from "next";
import { CareerOsDashboard } from "@/components/dashboard/CareerOsDashboard";

export const metadata: Metadata = {
  title: "Dashboard — iCareerOS",
};

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <CareerOsDashboard />
    </div>
  );
}
