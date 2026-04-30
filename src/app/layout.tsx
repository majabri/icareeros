import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "iCareerOS — Your AI Career Operating System",
  description:
    "Evaluate, advise, learn, act, coach, and achieve your career goals with AI-powered guidance.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Preconnect to Supabase for faster cold-start round trips */}
        <link rel="preconnect" href={process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""} />
        <link
          rel="preconnect"
          href={(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(
            "https://",
            "https://cdn.",
          )}
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-gray-50 text-gray-900 antialiased">
        {/* Skip navigation for keyboard / screen-reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
