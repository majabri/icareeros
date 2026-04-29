import type { Metadata } from "next";
import { HeroSection } from "@/components/landing/HeroSection";
import { LifecycleSection } from "@/components/landing/LifecycleSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { StatsSection } from "@/components/landing/StatsSection";
import { CTASection } from "@/components/landing/CTASection";
import { LandingNav } from "@/components/landing/LandingNav";
import { LandingFooter } from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "iCareerOS — Your AI Career Operating System",
  description:
    "From self-discovery to your next promotion. iCareerOS guides you through every stage of your career lifecycle with personalized AI.",
  openGraph: {
    title: "iCareerOS — Your AI Career Operating System",
    description:
      "Evaluate, advise, learn, act, coach, and achieve. iCareerOS is the career OS built for continuous growth.",
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
        <LifecycleSection />
        <FeaturesSection />
        <StatsSection />
        <CTASection />
      </main>
      <LandingFooter />
    </>
  );
}
