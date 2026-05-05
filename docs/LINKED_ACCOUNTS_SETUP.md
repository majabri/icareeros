# Linked Accounts — OAuth Provider Setup

> **One callback URL for everything.** Copy this once — every provider below uses it.
>
> ```
> https://kuneabeiwcxavvyyfjkx.supabase.co/auth/v1/callback
> ```

This guide takes you from zero → working "Sign in with Google / GitHub / LinkedIn" buttons on icareeros.com. Three providers, each ~5 minutes. All free.

The UI is already shipped (`/settings/linked-accounts` + buttons on `/auth/login`). The buttons render but won't work until each provider is configured in **Supabase Dashboard → Authentication → Providers**.

---

## Order of operations

1. Get the OAuth Client ID + Secret from the provider's developer console (sections below)
2. Paste them into Supabase Dashboard → Authentication → Providers → toggle the provider ON → Save
3. Test by going to `https://icareeros.com/auth/login` and clicking the provider button

---

## 1. LinkedIn (Sign in with LinkedIn using OpenID Connect)

The app already exists at https://www.linkedin.com/developers/apps/230741282 — just need product approval and the Client Secret.

### LinkedIn Developer Console

1. Open **https://www.linkedin.com/developers/apps/230741282/products**
2. Find **"Sign In with LinkedIn using OpenID Connect"** — click **Request access**. The legal modal opens.
3. Accept the agreement. Approval is **instant** for this product (no manual review).
4. Click the **Auth** tab at the top of the app page.
5. Under **OAuth 2.0 settings → Authorized redirect URLs for your app**, click **Add redirect URL** and paste:
   ```
   https://kuneabeiwcxavvyyfjkx.supabase.co/auth/v1/callback
   ```
   Click **Update**.
6. Still on the Auth tab — copy:
   - **Client ID:** `78jd1rtpgj0fnr` (already visible)
   - **Client Secret:** click **Generate a new client secret** if no secret is shown, then copy the value. ⚠️ It is shown only once.

### Supabase Dashboard

1. Open **https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx/auth/providers**
2. Scroll to **LinkedIn (OIDC)** — toggle it **ON**
3. Paste:
   - **Client ID** → from step 6 above
   - **Client Secret** → from step 6 above
4. Leave the callback URL field as-is (it auto-shows the same URL we added to LinkedIn)
5. Click **Save**

✅ LinkedIn done.

---

## 2. Google

### Google Cloud Console

1. Open **https://console.cloud.google.com/projectselector2/home/dashboard**
2. Top bar → click the project picker → **NEW PROJECT**
   - Project name: `iCareerOS`
   - Click **Create**
   - Wait for the green confirmation toast, then ensure the new project is selected (top bar)
3. Left nav → **APIs & Services** → **OAuth consent screen**
   - User Type: **External** → **Create**
   - App name: `iCareerOS`
   - User support email: your email
   - App logo: optional
   - App domain → Application home page: `https://icareeros.com`
   - Authorized domains: add `icareeros.com` and `supabase.co`
   - Developer contact info: your email
   - Click **Save and Continue**
   - **Scopes** step → **Add or Remove Scopes** → check `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` → **Update** → **Save and Continue**
   - **Test users** step → skip (you'll publish later) → **Save and Continue**
   - Final summary → **Back to Dashboard**
   - On the consent-screen overview, click **PUBLISH APP** → confirm. (No Google verification needed for these basic scopes.)
4. Left nav → **APIs & Services** → **Credentials**
5. Top bar → **+ Create Credentials** → **OAuth client ID**
   - Application type: **Web application**
   - Name: `iCareerOS Web`
   - Authorized JavaScript origins: `https://icareeros.com`
   - Authorized redirect URIs → **+ Add URI**:
     ```
     https://kuneabeiwcxavvyyfjkx.supabase.co/auth/v1/callback
     ```
   - Click **Create**
6. Modal pops up with the credentials. Copy:
   - **Client ID** (long string ending in `.apps.googleusercontent.com`)
   - **Client Secret** (shorter random string)

### Supabase Dashboard

1. **https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx/auth/providers**
2. **Google** row → toggle **ON**
3. Paste **Client ID** + **Client Secret**
4. Leave **Authorized Client IDs** empty (Web flow only)
5. Click **Save**

✅ Google done.

---

## 3. GitHub

### GitHub Developer Settings

1. Open **https://github.com/settings/developers**
2. Top tab **OAuth Apps** → **New OAuth App**
3. Fill in:
   - **Application name:** `iCareerOS`
   - **Homepage URL:** `https://icareeros.com`
   - **Application description:** `Career OS — sign in with GitHub` (optional)
   - **Authorization callback URL:**
     ```
     https://kuneabeiwcxavvyyfjkx.supabase.co/auth/v1/callback
     ```
4. Click **Register application**
5. On the resulting page:
   - Copy **Client ID** (visible)
   - Click **Generate a new client secret** → copy the value. ⚠️ Shown only once.

### Supabase Dashboard

1. **https://supabase.com/dashboard/project/kuneabeiwcxavvyyfjkx/auth/providers**
2. **GitHub** row → toggle **ON**
3. Paste **Client ID** + **Client Secret**
4. Click **Save**

✅ GitHub done.

---

## Test plan

After each provider goes green in Supabase:

1. **Sign-out** of icareeros.com if already signed in
2. Go to `https://icareeros.com/auth/login`
3. Click the provider button (Google / GitHub / LinkedIn)
4. Complete the provider's login flow
5. You should land on `/dashboard` (or `/admin` if your email is in the admin allow-list) **as the SAME account** if the email matches an existing user, or as a new account otherwise

If you get an error like *"provider not enabled"*, the provider toggle is still off in Supabase — go back and flip it on.

If you get *"redirect URI mismatch"*, the callback URL was typed wrong somewhere. Re-check it matches **exactly**:
```
https://kuneabeiwcxavvyyfjkx.supabase.co/auth/v1/callback
```

---

## Linking from inside the app

Once a user is already logged in (via email), they can link their other accounts at:

**`https://icareeros.com/settings/linked-accounts`**

Click **Connect** next to Google / GitHub / LinkedIn → OAuth flow → returns to the same page with a green **Connected** pill. Disconnect button appears next to linked providers.

The page refuses to disconnect the last linked identity (lockout safeguard).

---

## What we pull from each provider

| Provider | Verified data we receive | Used for |
|---|---|---|
| Google | email, name, avatar URL | populate user_profiles.full_name + avatar_url on first sign-in |
| GitHub | email (primary), login, avatar URL, basic profile | populate user_profiles.full_name + avatar_url on first sign-in |
| LinkedIn (OIDC) | email, name, avatar URL, member ID | populate user_profiles.full_name + avatar_url on first sign-in |

> **What we do NOT receive** (because Supabase OIDC scopes don't include them, and most are restricted to paid Talent Solutions partnerships):
> - LinkedIn: headline, summary, work history, skills
> - Google: Drive files, calendar, contacts
> - GitHub: private repos, organization membership beyond what the OAuth scope grants
>
> Auto-importing rich profile data from LinkedIn is **not possible** through the public API — it would require an enterprise Talent Solutions agreement.

---

## Apple — deferred

Apple Sign-In requires an active **Apple Developer Program** membership ($99/year). Once that's provisioned:

1. Apple Developer Console → Certificates, Identifiers & Profiles
2. Identifiers → New → **Services IDs** → name `com.icareeros.web`
3. Add Sign In with Apple capability → configure:
   - Domain: `icareeros.com`
   - Return URL: `https://kuneabeiwcxavvyyfjkx.supabase.co/auth/v1/callback`
4. Keys → New Key → enable **Sign In with Apple** → choose the Service ID created above → download the `.p8` key file (single download)
5. Note the **Key ID** and your **Team ID**
6. Supabase Dashboard → Apple → toggle ON → paste Service ID, Team ID, Key ID, Private Key contents → Save

Until then, the Apple row in `/settings/linked-accounts` shows as **Coming Soon** and is non-clickable.
