import type { Metadata } from "next";
import { PrivacyContactForm } from "@/components/legal/PrivacyContactForm";

export const metadata: Metadata = {
  title: "Contact iCareerOS Legal | iCareerOS",
  description: "Send a privacy or legal request to iCareerOS — used for DSARs, formal correspondence, and any legal inquiry.",
  robots: { index: true, follow: true },
};

export default function LegalContactPage() {
  return (
    <article className="text-gray-800">
      <h1 className="mb-2 text-3xl font-bold">Contact iCareerOS Legal</h1>
      <p className="mb-6 text-sm text-gray-600">
        Use this form for privacy questions, data subject access requests (DSARs),
        legal notices, or any formal correspondence. We aim to acknowledge within 5
        business days and resolve within the legally-mandated window for your
        jurisdiction (30 days under PIPEDA, 45 days under CCPA/CPRA).
      </p>
      <PrivacyContactForm />
    </article>
  );
}
