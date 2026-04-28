import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings — iCareerOS",
};

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <nav className="mt-4 flex gap-4 border-b border-gray-200 pb-0 text-sm">
          {[
            { href: "/settings/billing", label: "Billing" },
            { href: "/settings/profile",  label: "Profile" },
            { href: "/settings/account",  label: "Account" },
          ].map(({ href, label }) => (
            <a
              key={href}
              href={href}
              className="border-b-2 border-transparent px-1 pb-3 font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              {label}
            </a>
          ))}
        </nav>
      </div>
      {children}
    </div>
  );
}
