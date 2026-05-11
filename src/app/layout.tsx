import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n";
import { CookieConsent } from "@/components/legal/CookieConsent";
import { GlobalLegalFooter } from "@/components/legal/GlobalLegalFooter";
import { ThemeProvider } from "@/components/ThemeProvider";
import { NO_FOUC_SCRIPT } from "@/lib/theme";

export const metadata: Metadata = {
  title: "iCareerOS — Your AI Career Operating System",
  description:
    "Evaluate, advise, learn, act, coach, and achieve your career goals with AI-powered guidance.",
  metadataBase: new URL("https://icareeros.com"),
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon-32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/favicon.svg",
    apple: "/icon-32.png",
  },
  openGraph: {
    title: "iCareerOS — Your AI Career Operating System",
    description:
      "The AI-powered career OS that guides you from evaluation to achievement. Land your next role faster.",
    url: "https://icareeros.com",
    siteName: "iCareerOS",
    type: "website",
    locale: "en_US",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "iCareerOS — Your AI Career Operating System",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "iCareerOS — Your AI Career Operating System",
    description:
      "The AI-powered career OS that guides you from evaluation to achievement.",
    images: ["/opengraph-image"],
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
        {/*
          No-FOUC theme bootstrap — sets <html data-theme="..."> from
          localStorage (or OS prefers-color-scheme for auto) BEFORE the
          React tree paints. Without this, users who chose dark mode would
          see a light flash on every page load.

          See src/lib/theme.ts → NO_FOUC_SCRIPT for the full script body.
        */}
        <script dangerouslySetInnerHTML={{ __html: NO_FOUC_SCRIPT }} />

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
        <body className="min-h-screen text-gray-900 antialiased dark:text-[#F8FAFC]">
        <div
          aria-hidden="true"
          className="icareeros-bg-gradient"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: -1,
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
        <ThemeProvider><I18nProvider>{children}</I18nProvider></ThemeProvider>
        <GlobalLegalFooter />
        <CookieConsent />
      </body>
    </html>
  );
}
