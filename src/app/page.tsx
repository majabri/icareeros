import type { Metadata } from "next";
import { HeroSection } from "@/components/landing/HeroSection";
import { SocialProofSection } from "@/components/landing/SocialProofSection";
import { ProblemSection } from "@/components/landing/ProblemSection";
import { LifecycleSection } from "@/components/landing/LifecycleSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { StatsSection } from "@/components/landing/StatsSection";
import { FAQSection } from "@/components/landing/FAQSection";
import { CTASection } from "@/components/landing/CTASection";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "iCareerOS — Build Your Best Career, Every Single Stage",
  description:
    "iCareerOS is the AI-powered Career Operating System that guides you through every phase — from first job to executive leadership — with personalized guidance at every step.",
  openGraph: {
    title: "iCareerOS — Build Your Best Career, Every Single Stage",
    description:
      "Your Career Transformation Starts Here. Evaluate, Advise, Learn, Act, Coach, Achieve — iCareerOS guides you through the complete career lifecycle.",
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
