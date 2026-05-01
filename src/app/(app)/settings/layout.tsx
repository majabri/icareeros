import type { Metadata } from "next";
import { SettingsTabs } from "@/components/SettingsTabs";

export const metadata: Metadata = {
  title: "My Career — iCareerOS",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <SettingsTabs />
      {children}
    </div>
  );
}
