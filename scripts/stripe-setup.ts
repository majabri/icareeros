/**
 * iCareerOS — Stripe Product Setup Script
 * Pricing decision: Free / Premium $19/mo / Professional $129/mo
 *
 * Run ONCE when ready to enable monetization:
 *   STRIPE_SECRET_KEY=sk_live_xxx deno run --allow-net --allow-env scripts/stripe-setup.ts
 *
 * This creates in Stripe:
 *   - iCareerOS Free          (product only — no price, it's free)
 *   - iCareerOS Premium       ($19/mo, $190/yr)
 *   - iCareerOS Professional  ($129/mo, $1290/yr)
 *
 * After running, copy the price IDs into Supabase edge function secrets:
 *   supabase secrets set STRIPE_PRICE_PREMIUM=price_xxx
 *   supabase secrets set STRIPE_PRICE_PROFESSIONAL=price_xxx
 *
 * Then flip monetization on in Supabase:
 *   UPDATE public.feature_flags SET enabled = true WHERE key = 'monetization_enabled';
 */

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");
if (!STRIPE_SECRET_KEY) {
  console.error("❌ STRIPE_SECRET_KEY env var is required");
  Deno.exit(1);
}

async function stripe(
  method: string,
  path: string,
  body: Record<string, string | number | boolean>
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(
      Object.entries(body).map(([k, v]) => [k, String(v)])
    ).toString(),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    // deno-lint-ignore no-explicit-any
    throw new Error(`Stripe error on ${path}: ${(data as any).error?.message}`);
  }
  return data;
}

async function main() {
  console.log("🚀 Setting up iCareerOS Stripe products...\n");

  // ── Free Product (reference only, no price) ─────────────────────────────
  const free = await stripe("POST", "/products", {
    name: "iCareerOS Free",
    description:
      "Start your AI Career Operating System. No credit card required.",
    "metadata[plan]": "free",
  });
  console.log(`✅ Free product: ${free.id}`);

  // ── Premium — $19/mo ─────────────────────────────────────────────────────
  const premium = await stripe("POST", "/products", {
    name: "iCareerOS Premium",
    description:
      "Unlimited AI coaching cycles, 2 cover letters/mo, interview prep, and weekly career tracking.",
    "metadata[plan]": "premium",
  });
  console.log(`✅ Premium product: ${premium.id}`);

  const premiumMonthly = await stripe("POST", "/prices", {
    product:               premium.id as string,
    unit_amount:           1900,
    currency:              "usd",
    "recurring[interval]": "month",
    nickname:              "Premium Monthly",
    "metadata[plan]":      "premium",
  });
  console.log(`   Monthly price: ${premiumMonthly.id}`);

  const premiumAnnual = await stripe("POST", "/prices", {
    product:               premium.id as string,
    unit_amount:           19000,  // $190/yr — 2 months free
    currency:              "usd",
    "recurring[interval]": "year",
    nickname:              "Premium Annual",
    "metadata[plan]":      "premium",
  });
  console.log(`   Annual price:  ${premiumAnnual.id}`);

  // ── Professional — $129/mo ───────────────────────────────────────────────
  const professional = await stripe("POST", "/products", {
    name: "iCareerOS Professional",
    description:
      "Dedicated coaching dashboard, 5 cover letters/mo, unlimited mock interviews, 3–5 year roadmap, and priority support.",
    "metadata[plan]": "professional",
  });
  console.log(`✅ Professional product: ${professional.id}`);

  const professionalMonthly = await stripe("POST", "/prices", {
    product:               professional.id as string,
    unit_amount:           12900,
    currency:              "usd",
    "recurring[interval]": "month",
    nickname:              "Professional Monthly",
    "metadata[plan]":      "professional",
  });
  console.log(`   Monthly price: ${professionalMonthly.id}`);

  const professionalAnnual = await stripe("POST", "/prices", {
    product:               professional.id as string,
    unit_amount:           129000, // $1290/yr — 2 months free
    currency:              "usd",
    "recurring[interval]": "year",
    nickname:              "Professional Annual",
    "metadata[plan]":      "professional",
  });
  console.log(`   Annual price:  ${professionalAnnual.id}`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n✅ Done! Run these commands to configure the edge function:\n");
  console.log(`supabase secrets set STRIPE_PRICE_PREMIUM=${premiumMonthly.id}`);
  console.log(`supabase secrets set STRIPE_PRICE_PROFESSIONAL=${professionalMonthly.id}`);
  console.log("\nThen enable monetization in Supabase:");
  console.log("UPDATE public.feature_flags SET enabled = true WHERE key = 'monetization_enabled';");
  console.log("\nAnd set the Vercel env var:");
  console.log("NEXT_PUBLIC_MONETIZATION_ENABLED=true");
}

await main();
