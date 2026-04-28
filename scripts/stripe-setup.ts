/**
 * iCareerOS — Stripe Product Setup Script
 *
 * Run ONCE when ready to enable monetization:
 *   STRIPE_SECRET_KEY=sk_live_xxx deno run --allow-net --allow-env scripts/stripe-setup.ts
 *
 * This creates:
 *   - iCareerOS Free (product, no price needed — it's free)
 *   - iCareerOS Pro  ($29/mo, $290/yr)
 *   - iCareerOS Premium ($79/mo, $790/yr)
 *
 * After running, copy the price IDs printed at the end into your Supabase
 * edge function secrets:
 *   supabase secrets set STRIPE_PRICE_PRO=price_xxx
 *   supabase secrets set STRIPE_PRICE_PREMIUM=price_xxx
 *
 * Then set monetization_enabled = true in the feature_flags table.
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
  const data = await res.json() as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Stripe error on ${path}: ${(data as any).error?.message}`);
  }
  return data;
}

async function main() {
  console.log("🚀 Setting up iCareerOS Stripe products...\n");

  // ── Free Product (reference only, no price) ─────────────────────────────
  const free = await stripe("POST", "/products", {
    name:        "iCareerOS Free",
    description: "Get started with your AI Career Operating System. No credit card required.",
    "metadata[plan]": "free",
  });
  console.log(`✅ Free product: ${free.id}`);

  // ── Pro Product ──────────────────────────────────────────────────────────
  const pro = await stripe("POST", "/products", {
    name:        "iCareerOS Pro",
    description: "Unlimited Career OS cycles, AI Coach, advanced match insights.",
    "metadata[plan]": "pro",
  });
  console.log(`✅ Pro product: ${pro.id}`);

  const proMonthly = await stripe("POST", "/prices", {
    product:        pro.id as string,
    unit_amount:    2900,
    currency:       "usd",
    "recurring[interval]": "month",
    nickname:       "Pro Monthly",
    "metadata[plan]": "pro",
  });
  console.log(`   Monthly price: ${proMonthly.id}`);

  const proAnnual = await stripe("POST", "/prices", {
    product:        pro.id as string,
    unit_amount:    29000,
    currency:       "usd",
    "recurring[interval]": "year",
    nickname:       "Pro Annual",
    "metadata[plan]": "pro",
  });
  console.log(`   Annual price: ${proAnnual.id}`);

  // ── Premium Product ──────────────────────────────────────────────────────
  const premium = await stripe("POST", "/products", {
    name:        "iCareerOS Premium",
    description: "Everything in Pro plus priority support and advanced career intelligence.",
    "metadata[plan]": "premium",
  });
  console.log(`✅ Premium product: ${premium.id}`);

  const premiumMonthly = await stripe("POST", "/prices", {
    product:        premium.id as string,
    unit_amount:    7900,
    currency:       "usd",
    "recurring[interval]": "month",
    nickname:       "Premium Monthly",
    "metadata[plan]": "premium",
  });
  console.log(`   Monthly price: ${premiumMonthly.id}`);

  const premiumAnnual = await stripe("POST", "/prices", {
    product:        premium.id as string,
    unit_amount:    79000,
    currency:       "usd",
    "recurring[interval]": "year",
    nickname:       "Premium Annual",
    "metadata[plan]": "premium",
  });
  console.log(`   Annual price: ${premiumAnnual.id}`);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log("\n✅ Done! Run these commands to configure the edge function:\n");
  console.log(`supabase secrets set STRIPE_PRICE_PRO=${proMonthly.id}`);
  console.log(`supabase secrets set STRIPE_PRICE_PREMIUM=${premiumMonthly.id}`);
  console.log("\nThen enable monetization:");
  console.log("UPDATE public.feature_flags SET enabled = true WHERE key = 'monetization_enabled';");
}

await main();
