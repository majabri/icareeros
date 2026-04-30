import type { Metadata } from "next";
import { LandingNav }        from "@/components/landing/LandingNav";
import { HeroSection }       from "@/components/landing/HeroSection";
import { SocialProofSection } from "@/components/landing/SocialProofSection";
import { ProblemSection }    from "@/components/landing/ProblemSection";
import { LifecycleSection }  from "@/components/landing/LifecycleSection";
import { FeaturesSection }   from "@/components/landing/FeaturesSection";
import { StatsSection }      from "@/components/landing/StatsSection";
import { FAQSection }        from "@/components/landing/FAQSection";
import { CTASection }        from "@/components/landing/CTASection";
import { LandingFooter }     from "@/components/landing/LandingFooter";

export const metadata: Metadata = {
  title: "iCareerOS — Build Your Best Career, Every Single Stage",
  description:
    "From exploring possibilities to celebrating wins, iCareerOS guides you through every phase of your career journey with AI-powered insights, personalized learning, and human mentorship.",
  openGraph: {
    title: "iCareerOS — Build Your Best Career, Every Single Stage",
    description: "Your Career Transformation Starts Here. Evaluate, Advise, Learn, Act, Coach, Achieve.",
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
