"use client";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/mycareer/profile",     label: "Profile"            },
  { href: "/mycareer/preferences", label: "Search Preferences" },
];

const TITLE_BY_PATH: Record<string, string> = {
  "/mycareer/profile":     "Career Profile",
  "/mycareer/preferences": "Search Preferences",
};

export function MyCareerTabs() {
  const pathname = usePathname();

  // Title for the current sub-page; fall back to "My Career" for the index
  const title = (() => {
    for (const [path, label] of Object.entries(TITLE_BY_PATH)) {
      if (pathname === path || pathname.startsWith(path + "/")) return label;
    }
    return "My Career";
  })();

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold text-gray-900">{title}</h1>
      <nav className="mb-8 flex gap-0 border-b border-gray-200 text-sm overflow-x-auto">
        {TABS.map(({ href, label }) => {
          const active = pathname === href || pathname.startsWith(href + "/");
          return (
            <a key={href} href={href}
              className={`whitespace-nowrap border-b-2 px-4 pb-3 font-medium transition-colors
                ${active
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700"
                }`}>
              {label}
            </a>
          );
        })}
      </nav>
    </>
  );
}
