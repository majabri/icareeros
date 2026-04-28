import type { Metadata } from "next";
import { BillingSettings } from "@/components/billing/BillingSettings";

export const metadata: Metadata = {
  title: "Billing — iCareerOS",
};

export default function BillingPage() {
  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Billing & Plan</h2>
        <p className="mt-1 text-sm text-gray-500">
          Manage your subscription, view plan features, and upgrade when you&apos;re ready.
        </p>
      </div>
      <BillingSettings />
    </div>
  );
}
