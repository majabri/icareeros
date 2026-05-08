import type { Metadata } from "next";
import { HashScroll } from "@/components/legal/HashScroll";

export const metadata: Metadata = {
  title: "Terms of Service | iCareerOS",
  description: "iCareerOS Terms of Service.",
};

export default function TermsOfServicePage() {
  return (
    <article className="text-gray-800">
      <HashScroll />
      <h1 className="text-3xl font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-gray-500 mb-4">
        {/* TODO: replace [INSERT LAUNCH DATE] with the real launch date once known */}
        Effective Date: <strong>[INSERT LAUNCH DATE]</strong>
        {" | "}Last Updated: May 7, 2026
      </p>

      {/* DRAFT NOTICE — remove or update after lawyer approves */}
      <div className="mb-8 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <strong>Notice:</strong> These Terms of Service are in effect. They may be updated
        following legal review. Material changes will be communicated by email with 30 days
        advance notice.
      </div>

      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">1. Agreement to Terms</h2>
          <p>
            By creating an account, accessing, or using iCareerOS (&quot;the Service&quot;), you agree
            to be bound by these Terms of Service. These Terms constitute a legally binding
            agreement between you and iCareerOS LLC, a Michigan limited liability company
            (&quot;iCareerOS,&quot; &quot;we,&quot; &quot;us&quot;). If you do not agree, do not use the Service.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">2. Eligibility</h2>
          <p>
            You must be at least 18 years of age to use iCareerOS. By using the Service,
            you represent that you are 18 or older and have the legal capacity to enter
            into a binding agreement.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">3. Account Registration</h2>
          <p>
            To use iCareerOS you must create an account with your full name, email address,
            phone number, and password. You are responsible for maintaining the confidentiality
            of your credentials and for all activity under your account. Notify us immediately
            at support@icareeros.com if you suspect unauthorized access.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">4. AI-Powered Career Services</h2>
          <p>
            iCareerOS uses Claude AI (by Anthropic, PBC) to analyze your career information
            and provide personalized guidance. By using our AI features, you acknowledge:
          </p>
          <p className="mt-2">
            <strong>(a) AI Limitations:</strong> AI-generated recommendations are informational
            and advisory in nature. They are not a substitute for professional career
            counseling, legal advice, or employment decisions.
          </p>
          <p className="mt-2">
            <strong>(b) No Employment Guarantee:</strong> iCareerOS does not guarantee
            employment outcomes, job placement, salary increases, or any specific career result.
          </p>
          <p className="mt-2">
            <strong>(c) Human Review:</strong> You may request human review of any
            AI-generated recommendation by contacting support@icareeros.com.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">5. Subscription Plans and Pricing</h2>
          <p>
            <strong>Free Tier:</strong> Limited access, no payment required.
          </p>
          <p className="mt-2">
            <strong>Paid Subscriptions:</strong> Starter ($9.99/mo or $6.49/mo annual);
            Professional ($18.99/mo or $12.34/mo annual); Executive ($29.99/mo or
            $19.49/mo annual). Annual plans are billed upfront with a 35% discount.
          </p>
          <p className="mt-2">
            <strong>Sprint Add-Ons:</strong> Available from month 9 at $29.00 per session.
          </p>
          <p className="mt-2">
            <strong>Unemployment Discount:</strong> 30% discount for verified job seekers
            during months 5–8 of your subscription.
          </p>
          <p className="mt-2">
            All prices are in USD. Applicable taxes are added at checkout.
          </p>
        </div>

        <div id="founding-offer">
          <h2 className="text-lg font-semibold mt-6 mb-2 text-amber-900">
            6. Founding Lifetime Access Offer — PLEASE READ CAREFULLY
          </h2>

          <div className="border border-amber-400 rounded-lg p-4 bg-amber-50 mb-4">
            <p className="font-semibold text-amber-900 mb-2">
              THE $89.00 FOUNDING LIFETIME ACCESS FEE IS NON-REFUNDABLE
            </p>
            <p className="text-sm text-amber-800">
              By completing this purchase, you explicitly agree to the terms below.
              A separate acknowledgment checkbox is required at checkout.
            </p>
          </div>

          <p>
            iCareerOS offers a <strong>Founding Lifetime Access</strong> pass at{" "}
            <strong>$89.00 USD</strong> (one-time payment) to the first 1,000 qualifying
            purchasers (&quot;Founding Members&quot;).
          </p>

          <p className="mt-3"><strong>(a) Non-Refundable Payment.</strong> The $89.00
          Founding Lifetime Access fee is NON-REFUNDABLE under all circumstances, except
          as required by applicable law in your jurisdiction. Once payment is processed
          and your Founding Member account is activated, no refunds will be issued.</p>

          <p className="mt-3"><strong>(b) What &quot;Lifetime Access&quot; Means.</strong> &quot;Lifetime&quot;
          refers to the operational lifetime of the iCareerOS platform, not the lifetime
          of the purchaser. You receive access to the feature set available at time of
          purchase, subject to updates and modifications. iCareerOS reserves the right to
          modify, add, or remove features with reasonable notice. &quot;Lifetime Access&quot; does
          not guarantee access to future premium add-ons or enterprise features introduced
          after your purchase date.</p>

          <p className="mt-3"><strong>(c) Platform Discontinuation.</strong> In the event
          that iCareerOS permanently discontinues operations, we will provide a minimum of
          90 days&apos; advance written notice to all Founding Members via email.</p>

          <p className="mt-3"><strong>(d) Availability.</strong> The offer is limited to
          the first 1,000 purchasers as shown by the live seat counter. iCareerOS will
          honor all completed transactions processed before the limit is reached.</p>

          <p className="mt-3"><strong>(e) Non-Transferable.</strong> Founding Lifetime
          Access is personal to the original purchaser and may not be sold, gifted,
          assigned, or transferred.</p>

          <p className="mt-3"><strong>(f) Acknowledgment Required.</strong> Before
          completing purchase, you will be required to separately confirm: &quot;I understand
          and agree that the $89.00 Founding Lifetime Access fee is non-refundable,
          subject to applicable law.&quot;</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">7. Automatic Renewal</h2>
          <p>
            <strong>California Residents — Automatic Renewal Disclosure:</strong> Your
            subscription will automatically renew at the end of each billing period
            unless you cancel before the renewal date. Cancellation is available at any
            time through your Account Settings. You will receive a reminder email at
            least 30 days before your annual renewal date.
          </p>
          <p className="mt-2">
            <strong>Canadian Residents:</strong> Your subscription continues and
            automatically renews unless cancelled through Account Settings or by
            contacting support@icareeros.com. Cancellation takes effect at the end of
            the current billing period.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">8. Your Content</h2>
          <p>
            By uploading your resume or career information, you grant us a limited,
            non-exclusive, royalty-free license to process that content solely to provide
            our career services. We do not claim ownership of your personal data. You
            represent that you have the right to upload all content you provide.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">9. Prohibited Uses</h2>
          <p>You agree not to use iCareerOS to: (a) violate any law; (b) upload false or
          misleading information; (c) attempt to reverse-engineer or scrape our AI models;
          (d) share account credentials; (e) harass or harm other users; or (f) circumvent
          any security or access controls.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">10. Disclaimers</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTIES OF ANY KIND. TO THE FULLEST
            EXTENT PERMITTED BY APPLICABLE LAW, ICAREEROS DISCLAIMS ALL WARRANTIES,
            EXPRESS OR IMPLIED. ICAREEROS DOES NOT GUARANTEE EMPLOYMENT OUTCOMES OR
            SPECIFIC CAREER RESULTS.
          </p>
          <p className="mt-2">
            TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, ICAREEROS&apos;S TOTAL LIABILITY
            FOR ANY CLAIMS ARISING FROM YOUR USE OF THE SERVICE SHALL NOT EXCEED THE AMOUNT
            YOU PAID TO ICAREEROS IN THE 12 MONTHS PRECEDING THE CLAIM, OR $100 USD,
            WHICHEVER IS GREATER.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">11. Dispute Resolution</h2>
          <p>
            <strong>United States:</strong> Any disputes will be resolved by binding
            arbitration on an individual basis under AAA rules. Class action waivers apply.
            Governing law: Michigan.
          </p>
          <p className="mt-2">
            <strong>Canada:</strong> Disputes with Canadian users will be governed by
            applicable provincial consumer protection law. Canadian users retain all
            statutory rights that cannot be waived by contract.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">12. Changes to Terms</h2>
          <p>
            We will notify you of material changes by email and within the app at least
            30 days before they take effect. Continued use after the effective date
            constitutes acceptance.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">13. Contact</h2>
          <p>
            <strong>Legal inquiries:</strong> legal@icareeros.com<br />
            <strong>Support:</strong> support@icareeros.com
          </p>
        </div>
      </section>
    </article>
  );
}
