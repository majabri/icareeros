#!/bin/bash
# Apply branch protection rules to `main` per ADR 0002.
# Run once after the governance PR merges, then re-run only when CI checks change.
#
# Requires: gh CLI authenticated as a repo admin.
#   brew install gh
#   gh auth login
#
# Usage:
#   bash scripts/setup-branch-protection.sh

set -e

REPO="majabri/icareeros"
BRANCH="main"

echo "Setting branch protection on $REPO/$BRANCH..."

gh api "repos/$REPO/branches/$BRANCH/protection" \
  --method PUT \
  --input - <<'JSON'
{
  "required_status_checks": {
    "strict": true,
    "contexts": ["test-secrets", "Playwright E2E"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": true,
    "required_approving_review_count": 1
  },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": true,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON

echo ""
echo "Branch protection set. Verify at:"
echo "  https://github.com/$REPO/settings/branches"
echo ""
echo "Notes per ADR 0002:"
echo "  - 'enforce_admins: false' allows hotfix bypass — keep this until team grows."
echo "  - Required checks: test-secrets, Playwright E2E."
echo "  - Add 'tsc --noEmit' and 'vitest run' as required when those workflows exist."
