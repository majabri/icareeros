import type { Metadata } from "next";
import { LegalMarkdown } from "@/components/legal/LegalMarkdown";

export const metadata: Metadata = {
  title: "AI Use Disclosure — iCareerOS",
  description: "How iCareerOS uses AI, your rights, and our EU AI Act posture.",
};

export default function AIDisclosurePage() {
  return <LegalMarkdown slug="ai-disclosure" />;
}
