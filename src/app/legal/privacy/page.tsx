import type { Metadata } from "next";
import { HashScroll } from "@/components/legal/HashScroll";

export const metadata: Metadata = {
  title: "Privacy Policy | iCareerOS",
  description: "How iCareerOS collects, uses, and protects your personal information.",
};

export default function PrivacyPolicyPage() {
  return (
    <article className="text-gray-800">
      <HashScroll />
      <h1 className="text-3xl font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-gray-500 mb-4">
        Effective Date: <strong>June 1, 2026</strong>
        {" | "}Last Updated: May 7, 2026
        {" | "}Jurisdiction: United States and Canada
      </p>

      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">1. Who We Are</h2>
          <p>
            iCareerOS is operated by iCareerOS LLC, a Michigan limited liability company
            (&quot;we,&quot; &quot;us,&quot; &quot;our&quot;). We provide an AI-driven career transformation
            platform available at icareeros.com. Our designated contact for privacy matters is:
          </p>
          <ul className="list-none ml-4 mt-2 space-y-1">
            <li><strong>Privacy Officer:</strong> Amir Jabri</li>
            <li>
              <strong>Contact:</strong>{" "}
              <a href="/legal/contact" className="text-brand-700 underline">
                Use our contact form
              </a>
            </li>
          </ul>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">2. Scope of This Policy</h2>
          <p>
            This Privacy Policy explains how we collect, use, store, and protect the
            personal information of users located in the United States and Canada. It
            applies to our website at icareeros.com, our web application, and any related
            services or communications.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">3. Information We Collect</h2>
          <p>
            We collect the following categories of personal information directly from you
            when you create an account or use our platform:
          </p>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Identity:</strong> Full name</li>
            <li><strong>Contact:</strong> Email address, phone number</li>
            <li><strong>Authentication:</strong> Password (stored as an encrypted hash — never in plain text)</li>
            <li><strong>Career Data:</strong> Resume content including work history, education, skills, and certifications</li>
            <li><strong>Behavioral:</strong> Features used, session duration, navigation within the app</li>
            <li><strong>Inferred/Derived:</strong> AI-generated career assessments and recommendations</li>
          </ul>
          <p className="mt-2">
            We do NOT collect Social Security numbers, financial account numbers, health or
            biometric data, racial or ethnic origin, precise geolocation, or data from
            third-party sources such as LinkedIn.
          </p>
        </div>

        <div id="ai-processing">
          <h2 className="text-lg font-semibold mt-6 mb-2">4. Use of AI and Automated Processing</h2>
          <p>
            iCareerOS uses Claude AI (developed by Anthropic, PBC) to analyze your resume
            and career information and generate personalized career recommendations,
            assessments, and action plans across six stages: Evaluate, Advise, Learn, Act,
            Coach, and Achieve.
          </p>
          <p className="mt-2">
            <strong>What the AI does:</strong> Reads and interprets your resume content to
            identify career stages, skill gaps, and professional strengths; generates
            personalized career recommendations and coaching content tailored to your profile;
            and creates action plans based on your career goals.
          </p>
          <p className="mt-2">
            <strong>What the AI does NOT do:</strong> Make final employment decisions on your
            behalf; share your resume or personal data with employers or recruiters; or sell
            or transmit your career data to third parties for commercial purposes.
          </p>
          <p className="mt-2">
            <strong>California Residents (CCPA/CPRA):</strong> You have the right to know
            that your data is processed by automated AI; to request human review of any
            AI-generated recommendation; and to opt out of automated processing (note: this
            significantly limits platform functionality).
          </p>
          <p className="mt-2">
            <strong>Canadian Residents (PIPEDA):</strong> You have the right to know your
            information is used in automated decision-making and to withdraw consent at any
            time. To exercise these rights, please <a href="/legal/contact" className="text-brand-700 underline">contact us through our contact form</a>.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">5. How We Use Your Information</h2>
          <ul className="list-disc ml-6 mt-2 space-y-1">
            <li><strong>Service Delivery:</strong> Processing your resume to generate career assessments and coaching through our Career Operating System.</li>
            <li><strong>Account Management:</strong> Creating and maintaining your account and enabling platform access.</li>
            <li><strong>Communication:</strong> Sending service notifications and (with your consent) marketing communications.</li>
            <li><strong>Platform Improvement:</strong> Analyzing aggregate, anonymized usage patterns to improve features.</li>
            <li><strong>Security:</strong> Detecting and preventing unauthorized access or fraudulent activity.</li>
            <li><strong>Legal Compliance:</strong> Fulfilling obligations under applicable law.</li>
          </ul>
          <p className="mt-2">
            We do NOT sell your personal information or share your resume with employers
            without your explicit instruction.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">6. How We Share Your Information</h2>
          <p>
            We share your personal information only with: (a) service providers necessary
            to operate the platform, including Anthropic, PBC (AI processing), Supabase
            (database hosting), Vercel (application hosting), and our payment processor —
            all bound by data processing agreements; and (b) government authorities when
            required by law. We do not sell your data or share it with advertising networks.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">7. Data Retention</h2>
          <p>
            We retain your account information for the life of your account plus 30 days
            after deletion. Resume content is deleted within 30 days of account deletion.
            Transaction records are retained for 7 years for tax compliance. Consent records
            are retained for 5 years for legal compliance.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">8. Data Security</h2>
          <p>
            Passwords are hashed and never stored in plain text. All data is encrypted in
            transit (TLS 1.2+) and at rest. Access is restricted to authorized personnel.
            In the event of a breach posing significant risk, we will notify affected users
            and applicable regulators within required timeframes.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">9. International Data Transfers</h2>
          <p>
            iCareerOS is based in the United States. If you are located in Canada, your
            personal information is processed in the United States. We ensure appropriate
            contractual safeguards are in place with our service providers.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">10. Your Privacy Rights</h2>
          <p><strong>California Residents (CCPA/CPRA):</strong> You have the right to know,
          access, delete, correct, and opt out of the sale of your personal information. We
          respond to verified requests within 45 days. <a href="/legal/contact" className="text-brand-700 underline">Contact us through our contact form</a>.</p>
          <p className="mt-2"><strong>Canadian Residents (PIPEDA):</strong> You have the right
          to access, correct, and request deletion of your personal information, and to
          withdraw consent at any time. We respond within 30 days. You may also contact the
          Office of the Privacy Commissioner of Canada at www.priv.gc.ca.</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">11. Cookies</h2>
          <p>
            We use strictly necessary cookies (always active), and optional functional and
            analytics cookies (active only with your consent). We do not use advertising
            cookies. You will be presented with a cookie consent banner on your first visit.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">12. Children</h2>
          <p>
            iCareerOS is not directed at individuals under 18. We do not knowingly collect
            information from minors and will delete any such information promptly upon
            becoming aware of it.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">13. Changes to This Policy</h2>
          <p>
            We will notify you of material changes by email and within the app at least 14
            days before they take effect. Continued use after the effective date constitutes
            acceptance of the revised policy.
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold mt-6 mb-2">14. Contact Us</h2>
          <p>
            <strong>Contact us:</strong>{" "}
            <a href="/legal/contact" className="text-brand-700 underline">
              Use our contact form
            </a>
            <br />
            <strong>Website:</strong> icareeros.com/legal/privacy
          </p>
        </div>
      </section>
    </article>
  );
}
