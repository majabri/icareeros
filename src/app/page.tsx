import type { Metadata } from "next";
import { ConstellationBackground } from "@/components/ConstellationBackground";
import { LandingNav }       from "@/components/landing/LandingNav";
import { HeroSection }      from "@/components/landing/HeroSection";
import { ProblemSection }   from "@/components/landing/ProblemSection";
import { LifecycleSection } from "@/components/landing/LifecycleSection";
import { FeaturesSection }  from "@/components/landing/FeaturesSection";
import { FAQSection }       from "@/components/landing/FAQSection";
import { CTASection }       from "@/components/landing/CTASection";

export const metadata: Metadata = {
  title: "iCareerOS — The career OS that runs on outcomes, not advice.",
  description:
    "Six stages. One loop. Real outcomes. iCareerOS is a continuous career operating system — Evaluate, Advise, Learn, Act, Coach, Achieve — that keeps running until you hit your next milestone.",
  openGraph: {
    title: "iCareerOS — The career OS that runs on outcomes, not advice.",
    description: "Six stages. One loop. Real outcomes. Evaluate → Advise → Learn → Act → Coach → Achieve → repeat.",
    url: "https://icareeros.com",
    siteName: "iCareerOS",
    type: "website",
    locale: "en_US",
  },
  alternates: { canonical: "https://icareeros.com" },
};

export default function LandingPage() {
  return (
    <>
      <ConstellationBackground />
      <div style={{ position: "relative", zIndex: 1 }}>
        <LandingNav />
        <main>
          <HeroSection />
          <ProblemSection />
          <LifecycleSection />
          <FeaturesSection />
          <FAQSection />
          <CTASection />
        </main>
      </div>
    </>
  );
}
