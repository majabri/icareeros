import type { Metadata } from "next";
import { SettingsTabs } from "@/components/SettingsTabs";

export const metadata: Metadata = {
  title: "Profile — iCareerOS",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Profile</h1>
        <SettingsTabs />
      </div>
      {children}
    </div>
  );
}
