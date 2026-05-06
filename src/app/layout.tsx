import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { CookieConsent } from "@/components/legal/CookieConsent";
import { GlobalLegalFooter } from "@/components/legal/GlobalLegalFooter";

export const metadata: Metadata = {
  title: "iCareerOS — Your AI Career Operating System",
  description:
    "Evaluate, advise, learn, act, coach, and achieve your career goals with AI-powered guidance.",
  metadataBase: new URL("https://icareeros.com"),
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
  openGraph: {
    title: "iCareerOS — Your AI Career Operating System",
    description:
      "The AI-powered career OS that guides you from evaluation to achievement. Land your next role faster.",
    url: "https://icareeros.com",
    siteName: "iCareerOS",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "iCareerOS — Your AI Career Operating System",
    description:
      "The AI-powered career OS that guides you from evaluation to achievement.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: "https://icareeros.com",
  },
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
      {/*
          Safari fix: do NOT put `background-attachment: fixed` on <body> — in
          WebKit it creates a containing block that breaks `position: sticky` on
          the sidebar and causes clicks to misalign with rendered UI.
          The gradient is rendered as a sibling fixed <div> below instead.
        */}
        <body className="min-h-screen text-gray-900 antialiased">
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: -1,
            background: "linear-gradient(135deg, #f5f7ff 0%, #e8f5ff 50%, #fff5e8 100%)",
            pointerEvents: "none",
          }}
        />
        {/* Skip navigation for keyboard / screen-reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand-600 focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white focus:shadow-lg"
        >
          Skip to main content
        </a>
        <I18nProvider>{children}</I18nProvider>
        <GlobalLegalFooter />
        <CookieConsent />
      </body>
    </html>
  );
}
