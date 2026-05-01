import type { Metadata } from "next";
import { LandingNav }         from "@/components/landing/LandingNav";
import { HeroSection }        from "@/components/landing/HeroSection";
import { SocialProofSection } from "@/components/landing/SocialProofSection";
import { ProblemSection }     from "@/components/landing/ProblemSection";
import { LifecycleSection }   from "@/components/landing/LifecycleSection";
import { FeaturesSection }    from "@/components/landing/FeaturesSection";
import { StatsSection }       from "@/components/landing/StatsSection";
import { FAQSection }         from "@/components/landing/FAQSection";
import { CTASection }         from "@/components/landing/CTASection";
import { LandingFooter }      from "@/components/landing/LandingFooter";

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
  },
};

export default function LandingPage() {
  return (
    <>
      <LandingNav />
      <main>
        <HeroSection />
        <SocialProofSection />
        <ProblemSection />
        <LifecycleSection />
        <FeaturesSection />
        <StatsSection />
        <FAQSection />
        <CTASection />
      </main>
      <LandingFooter />
    </>
  );
}
