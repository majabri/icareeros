import type { Metadata } from "next";
import { LegalMarkdown } from "@/components/legal/LegalMarkdown";

export const metadata: Metadata = {
  title: "Terms of Service — iCareerOS",
  description: "Terms governing use of iCareerOS.",
};

export default function TermsOfServicePage() {
  return <LegalMarkdown slug="terms" />;
}
