import type { Metadata } from "next";
import { MyCareerTabs } from "@/components/MyCareerTabs";

export const metadata: Metadata = { title: "My Career — iCareerOS" };

export default function MyCareerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <MyCareerTabs />
      {children}
    </div>
  );
}
