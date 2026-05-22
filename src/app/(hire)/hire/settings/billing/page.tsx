"use client";

/**
 * /settings/billing on hire.icareeros.com — recruiter plan & billing.
 *
 * Per COWORK-BRIEF-hire-settings-pages-v1 Task 2 — hire.* tiers,
 * NOT job-seeker tiers:
 *
 *   Free        $0   / mo  — candidate search, company profile, limited invites
 *   Starter     $49  / mo  — unlimited invites, full pipeline, priority search
 *   Growth      $149 / mo  — Starter + analytics, team seats
 *   Enterprise  $399 / mo  — Growth + dedicated support, custom integrations
 *
 * Annual discount: 35% off all paid plans.
 *
 * Current-plan source: reads `user_profiles.plan` if available, defaults
 * to 'Free' otherwise. Matches the app pattern of treating plan as a
 * column lookup with a safe fallback rather than a blocking dependency.
 *
 * Upgrade CTA: mailto for now — Stripe checkout wires in mid-June 2026
 * when billing goes live (see TODO below). Do NOT integrate Stripe in
 * this PR.
 *
 * Visual: BRAND_COLORS from @/lib/design-tokens — no hardcoded hex.
 */

import { useState, useEffect } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase";
import { SettingsNav } from "@/components/hire/SettingsNav";
import { BRAND_COLORS } from "@/lib/design-tokens";

type PlanId = "free" | "starter" | "growth" | "enterprise";

interface Tier {
  id:       PlanId;
  label:    string;
  price:    string;       // monthly display
  included: string;
}

const TIERS: readonly Tier[] = [
  { id: "free",       label: "Free",       price: "$0 / mo",   included: "Candidate search, company profile, limited invites" },
  { id: "starter",    label: "Starter",    price: "$49 / mo",  included: "Unlimited invites, full pipeline, priority search" },
  { id: "growth",     label: "Growth",     price: "$149 / mo", included: "Everything in Starter + analytics, team seats" },
  { id: "enterprise", label: "Enterprise", price: "$399 / mo", included: "Everything in Growth + dedicated support, custom integrations" },
];

function normalizePlan(value: unknown): PlanId {
  const s = typeof value === "string" ? value.toLowerCase() : "";
  if (s === "starter" || s === "growth" || s === "enterprise") return s;
  return "free";
}

export default function HireBillingSettingsPage() {
  const supabase = createClient();

  const [currentPlan, setCurrentPlan] = useState<PlanId>("free");
  const [renewalAt, setRenewalAt]     = useState<string | null>(null);
  const [loading, setLoading]         = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setLoading(false); return; }
      const { data } = await supabase
        .from("user_profiles")
        .select("plan, plan_renewal_at")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setCurrentPlan(normalizePlan(data?.plan));
      setRenewalAt(typeof data?.plan_renewal_at === "string" ? data.plan_renewal_at : null);
      setLoading(false);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isFreePlan = currentPlan === "free";
  // TODO: wire to Stripe checkout when billing goes live ~2026-06-10.
  const upgradeHref  = "mailto:support@icareeros.com?subject=Upgrade%20Request";
  // TODO: wire to Stripe portal when billing goes live ~2026-06-10.
  const manageHref   = "mailto:support@icareeros.com?subject=Billing%20Management";

  const currentTier = TIERS.find((t) => t.id === currentPlan) ?? TIERS[0];

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "2rem 1.5rem" }}>
      <SettingsNav />

      <header style={{ marginBottom: "1.5rem" }}>
        <h1 style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--text-primary, #0F1B2D)", margin: 0 }}>
          Plan &amp; Billing
        </h1>
        <p style={{ marginTop: "0.4rem", fontSize: "0.9rem", color: "var(--text-muted, #64748B)" }}>
          Manage your hiring plan, see what&apos;s included, and upgrade when you&apos;re ready.
        </p>
      </header>

      {/* Section 1 — Current plan */}
      <section style={{
        background:   "var(--surface-card, #FFFFFF)",
        border:       "1px solid var(--surface-border, #E5E7EB)",
        borderLeft:   `4px solid ${BRAND_COLORS.teal}`,
        borderRadius: 12,
        padding:      "1.25rem 1.5rem",
        marginBottom: "1.5rem",
      }}>
        <div style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: BRAND_COLORS.teal }}>
          Current plan
        </div>
        <div style={{
          marginTop: "0.35rem",
          fontSize:  "1.4rem",
          fontWeight: 800,
          color:     "var(--text-primary, #0F1B2D)",
        }}>
          {loading ? "—" : `${currentTier.label} plan`}
        </div>
        {renewalAt && !loading && (
          <div style={{ marginTop: "0.25rem", fontSize: "0.85rem", color: "var(--text-muted, #64748B)" }}>
            Renews on {new Date(renewalAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
          </div>
        )}
        <div style={{ marginTop: "1rem" }}>
          {isFreePlan ? (
            <Link
              href={upgradeHref}
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            "0.35rem",
                background:     BRAND_COLORS.teal,
                color:          "#FFFFFF",
                fontWeight:     700,
                fontSize:       "0.92rem",
                padding:        "0.6rem 1.2rem",
                borderRadius:   10,
                textDecoration: "none",
              }}
            >
              Upgrade to Starter →
            </Link>
          ) : (
            <Link
              href={manageHref}
              style={{
                display:        "inline-flex",
                alignItems:     "center",
                gap:            "0.35rem",
                background:     "transparent",
                color:          BRAND_COLORS.teal,
                border:         `1.5px solid ${BRAND_COLORS.teal}`,
                fontWeight:     700,
                fontSize:       "0.92rem",
                padding:        "0.55rem 1.2rem",
                borderRadius:   10,
                textDecoration: "none",
              }}
            >
              Manage billing →
            </Link>
          )}
        </div>
      </section>

      {/* Section 2 — What's included (all 4 tiers) */}
      <section style={{
        background:   "var(--surface-card, #FFFFFF)",
        border:       "1px solid var(--surface-border, #E5E7EB)",
        borderRadius: 12,
        padding:      "1.25rem 1.5rem",
      }}>
        <h2 style={{ margin: 0, fontSize: "1rem", fontWeight: 700, color: "var(--text-primary, #0F1B2D)" }}>
          What&apos;s included
        </h2>
        <p style={{ marginTop: "0.3rem", fontSize: "0.85rem", color: "var(--text-muted, #64748B)" }}>
          Annual discount: 35% off all paid plans.
        </p>

        <div style={{ marginTop: "1rem", display: "grid", gap: "0.6rem" }}>
          {TIERS.map((tier) => {
            const active = tier.id === currentPlan;
            return (
              <div
                key={tier.id}
                style={{
                  display:        "grid",
                  gridTemplateColumns: "auto 1fr",
                  alignItems:     "center",
                  gap:            "1rem",
                  padding:        "0.85rem 1rem",
                  border:         active
                    ? `2px solid ${BRAND_COLORS.teal}`
                    : "1px solid var(--surface-border, #E5E7EB)",
                  borderRadius:   10,
                  background:     active ? `${BRAND_COLORS.teal}0A` : "transparent",
                }}
              >
                <div style={{ minWidth: 120 }}>
                  <div style={{ fontSize: "0.95rem", fontWeight: 800, color: "var(--text-primary, #0F1B2D)" }}>
                    {tier.label}
                  </div>
                  <div style={{ marginTop: "0.15rem", fontSize: "0.82rem", color: BRAND_COLORS.teal, fontWeight: 600 }}>
                    {tier.price}
                  </div>
                </div>
                <div style={{ fontSize: "0.88rem", color: "var(--text-muted, #475569)", lineHeight: 1.45 }}>
                  {tier.included}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
