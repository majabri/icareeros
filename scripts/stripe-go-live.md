# Stripe Go-Live Checklist (Day 52)

Complete these steps in order. Claude prepares the code; **Amir performs steps 1–4**.

## Steps Amir Must Do

### 1. Swap Stripe keys to live mode
In Vercel dashboard → Settings → Environment Variables:
- `STRIPE_SECRET_KEY`: replace `sk_test_...` with `sk_live_...`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: replace `pk_test_...` with `pk_live_...`

### 2. Create live products and prices
After setting live `STRIPE_SECRET_KEY`, run:
```bash
STRIPE_SECRET_KEY=sk_live_... npx ts-node scripts/stripe-setup.ts
```
This creates the live product/price IDs. Copy the output — you'll need the price IDs for step 3.

### 3. Update price ID env vars in Vercel
- `STRIPE_PRICE_PREMIUM`: paste the live premium price ID (`price_live_...`)
- `STRIPE_PRICE_PROFESSIONAL`: paste the live professional price ID (`price_live_...`)

### 4. Register webhook in Stripe live dashboard
1. Go to https://dashboard.stripe.com → Developers → Webhooks → Add endpoint
2. Endpoint URL: `https://kuneabeiwcxavvyyfjkx.supabase.co/functions/v1/billing-service`
3. Events to listen: `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`
4. Copy the signing secret → set `STRIPE_WEBHOOK_SECRET` in Supabase secrets (not Vercel)

### 5. Enable monetization feature flag
In `/admin` → Feature Flags → set `monetization_enabled = true`

## Verification Checklist
- [ ] Checkout flow works end-to-end with a test Visa card (4242 4242 4242 4242)
- [ ] Webhook fires on test checkout (check Supabase edge fn logs)
- [ ] `billing_subscriptions` row created for test user
- [ ] Plan badge updates in `/settings/billing`
- [ ] Cancel flow tested

## Rollback
If anything breaks: swap `STRIPE_SECRET_KEY` back to `sk_test_...` and redeploy.
