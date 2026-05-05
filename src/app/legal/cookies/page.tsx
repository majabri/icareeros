import type { Metadata } from "next";
import { LegalMarkdown } from "@/components/legal/LegalMarkdown";

export const metadata: Metadata = {
  title: "Cookie Policy — iCareerOS",
  description: "Cookies and similar technologies used by iCareerOS.",
};

export default function CookiePolicyPage() {
  return <LegalMarkdown slug="cookies" />;
}
