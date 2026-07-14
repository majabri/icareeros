# Cowork token fetch — Vercel env-var pattern

Cowork sessions running against this project need three credentials. All three are stored as `encrypted`-type env vars in the Vercel project so they can be fetched programmatically each session instead of pasted into chat. This doc pins down the working fetch pattern after we hit two failure modes in this discovery.

## The three tokens

| Purpose | Vercel env-var key | Vercel env-var **id** | Scope |
|---|---|---|---|
| Repo PRs (branches, commits, PR open/merge, non-workflow code) | `COWORK_GITHUB_PAT` | `iySxD93pE76mBO3w` | GitHub `repo` |
| **Anything under `.github/workflows/`** (CI edits, workflow YAML) | `COWORK_GITHUB_WORKFLOW_PAT` | `EJdVavSdjrzBlDM4` | GitHub `repo + workflow` |
| Supabase edge-function deploy + management-API SQL | `SUPABASE_MGMT_TOKEN` | `RLOeBdRQBBPVk8zb` | Supabase PAT (`sbp_...`) |

**Which one to use when:**

- Touching `src/**`, `docs/**`, `.github/ISSUE_TEMPLATE/**`, `vercel.json`, or any non-workflow file → **`COWORK_GITHUB_PAT`**.
- Touching **anything** under `.github/workflows/*` — GitHub's `repo`-only PAT is refused on push. Must use `COWORK_GITHUB_WORKFLOW_PAT`. If a session tries pushing to `.github/workflows/*` with the repo-only PAT, git returns `remote: invalid credentials` / `fatal: Authentication failed`.
- Deploying an edge function under `supabase/functions/*`, running SQL via `api.supabase.com/v1/projects/{ref}/database/query`, or applying a migration → **`SUPABASE_MGMT_TOKEN`**.

## The critical gotcha — Vercel LIST endpoint does NOT decrypt

Vercel's list endpoint (`GET /v9/projects/{id}/env`) returns **encrypted blobs** for `encrypted`-type values, not the plaintext. The blob is Vercel's internal envelope format (`{"v":"v2","c":"..."}` base64-encoded) and is unusable — 1100–1300 chars, does not match a valid PAT format.

This is true regardless of:
- API version (`/v9`, `/v10` both return the blob)
- `?decrypt=true` query param (ignored on the list endpoint)
- Env-var `type` (`plain` env vars come back in plaintext; `encrypted` type comes back as a blob)

**The by-ID endpoint (`GET /v1/projects/{id}/env/{envId}`) DOES decrypt** and returns the plaintext value.

### ❌ Broken pattern (returns encrypted blob)

```bash
VCP=<vercel_api_token>
SBP=$(curl -s -H "Authorization: Bearer $VCP" \
  "https://api.vercel.com/v9/projects/icareeros/env" \
  | python3 -c 'import sys,json; [print(e["value"]) for e in json.load(sys.stdin)["envs"] if e["key"]=="SUPABASE_MGMT_TOKEN"]')
# → $SBP is a 1108-char base64 blob starting with 'eyJ2IjoidjIiLCJjIjoi'
# → Any curl -H "Authorization: Bearer $SBP" returns 401 JWT could not be decoded
```

### ✅ Working pattern (fetch by ID)

```bash
VCP=<vercel_api_token>

# Supabase management PAT
SBP=$(curl -s -H "Authorization: Bearer $VCP" \
  "https://api.vercel.com/v1/projects/icareeros/env/RLOeBdRQBBPVk8zb" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["value"])')
# → $SBP is a 44-char string starting with 'sbp_'

# GitHub PAT (repo-only — for src/**, docs/**, PRs)
COWORK_PAT=$(curl -s -H "Authorization: Bearer $VCP" \
  "https://api.vercel.com/v1/projects/icareeros/env/iySxD93pE76mBO3w" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["value"])')
# → $COWORK_PAT is a 93-char string starting with 'github_pat_'

# GitHub PAT (workflow-scoped — required for .github/workflows/* edits)
COWORK_WF_PAT=$(curl -s -H "Authorization: Bearer $VCP" \
  "https://api.vercel.com/v1/projects/icareeros/env/EJdVavSdjrzBlDM4" \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["value"])')
# → $COWORK_WF_PAT is a 93-char string starting with 'github_pat_'
```

### Sanity check that decryption succeeded

Each token has a distinct prefix. If the decrypt succeeded, the first characters will be:

- `sbp_...` → Supabase management PAT
- `github_pat_11...` → GitHub fine-grained PAT

If the value starts with `eyJ2IjoidjIiLCJjIjoi`, decryption did NOT happen — the list endpoint got used by mistake. Recheck the URL.

## Vercel API token — how to obtain

The `$VCP` token above is a Vercel personal / team API token. Amir keeps a rotating one and passes it into Cowork sessions on demand. It does not currently live in Vercel itself (chicken-and-egg — we'd need it to fetch it). Pass it as `vcp_...` at session start; the session uses it only for the by-ID fetches above.

## Rotation cadence

The two GitHub PATs are on a 90-day rotation window (per `feedback_cowork_pat_2026-05-22` memory). When one expires:

1. Amir generates a new fine-grained PAT on GitHub with the appropriate scope (`repo` for the base cowork PAT, `repo + workflow` for the workflow-scoped one).
2. Amir updates the corresponding Vercel env var in-place — **do NOT delete and recreate** because that would change the env-var ID and invalidate every session's hardcoded ID references.
3. `updatedAt` on the Vercel env var advances to now; `createdAt` and `id` remain stable.

The Supabase management token has no fixed rotation cadence today — rotate whenever operationally relevant.

If a token needs to be rotated between sessions, the affected session sees a `401 Bad credentials` from GitHub or `401 JWT could not be decoded` from Supabase. Neither ID nor the fetch pattern changes.

## Recreation is NOT the fix for "encrypted blob returned"

If a future session sees the list endpoint returning encrypted blobs and thinks "the env var is broken, let me delete and recreate": **that will not help.** All three env vars behave identically under the list endpoint (verified 2026-07-14 with identical metadata: `type=encrypted, target=['production'], contentType=None, gitBranch=None, configurationId=None`). The list endpoint's decrypt behavior is a Vercel API contract, not a per-env-var setting.

**The fix is switching from the list endpoint to the by-ID endpoint** — no config change on Vercel required.

## Adding a new Cowork-owned token

If Cowork needs a fourth long-lived credential:

1. Generate the credential at the source (GitHub, Supabase, whatever).
2. POST to `https://api.vercel.com/v10/projects/icareeros/env` with:
   ```json
   {
     "key":     "NEW_COWORK_TOKEN_KEY",
     "value":   "<the token>",
     "type":    "encrypted",
     "target":  ["production"],
     "comment": "<what it's for + provisioned date>"
   }
   ```
3. Note the returned `id` and add a row to the table at the top of this doc.
4. Update session-startup scripts to fetch it by ID.

Never store a Cowork-owned credential as `sensitive` type — that's write-only from the API's perspective (returns empty string even from the by-ID endpoint). `encrypted` is the correct type for API-readable credentials.

## Provenance

- Investigation happened 2026-07-14 after PR #367-#373 series.
- Behaviour confirmed against `api.vercel.com/v1/projects/icareeros/env/{id}` for all three IDs.
- No env-var recreation was needed — all three tokens are stored correctly; only the fetch pattern needed to change.
