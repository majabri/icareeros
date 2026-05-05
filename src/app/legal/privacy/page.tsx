import type { Metadata } from "next";
import { LegalMarkdown } from "@/components/legal/LegalMarkdown";

export const metadata: Metadata = {
  title: "Privacy Policy — iCareerOS",
  description: "How iCareerOS collects, uses, and protects your personal data.",
};

export default function PrivacyPolicyPage() {
  return <LegalMarkdown slug="privacy" />;
}
