# AppSidebar — Technical Implementation Reference

**File:** `src/components/AppSidebar.tsx`  
**Commit:** `6d838d5` (feat: comprehensive lifecycle stage UX enhancement)  
**Last updated:** 2026-05-01

---

## Architecture Overview

`AppSidebar` is a client component (`"use client"`) that renders:
1. A **desktop sidebar** (sticky, 256 px wide, collapsible to 48 px icon strip)
2. A **mobile overlay drawer** (full-height, 256 px, slides in from left)

Navigation is structured around six `CareerOsStage` values:
```
"evaluate" | "advise" | "learn" | "act" | "coach" | "achieve"
```

Stage ordering is driven by `STAGE_ORDER` from `careerOsOrchestrator`. The active cycle is fetched via `getActiveCycle(userId)` from Supabase on mount.

---

## Key State

| State | Type | Purpose |
|---|---|---|
| `currentStage` | `CareerOsStage` | Active stage from `career_os_cycles.current_stage` |
| `collapsed` | `boolean` | Desktop sidebar collapsed/expanded |
| `stageLoaded` | `boolean` | Controls skeleton loader visibility |
| `learnExpanded` | `boolean` | Learn stage sub-item accordion |
| `mobileOpen` | `boolean` | Mobile drawer open/closed |
| `mobileOpen_stages` | `Set<CareerOsStage>` | Per-stage accordion expansion (mobile) |
| `lockNotice` | `CareerOsStage \| null` | Which locked stage notice is showing |

---

## Data Flow

```
mount → createClient().auth.getUser()
      → getActiveCycle(userId) [Supabase: career_os_cycles]
      → setCurrentStage(cycle.current_stage ?? "evaluate")
      → setStageLoaded(true)
```

While `!stageLoaded`, `<SkeletonBar />` pulses in place of stage items.

---

## Stage Classification

For any `section.stage`:
- `stageIndex < currentIndex` → **past** (green checkmark shown)
- `stageIndex === currentIndex` → **active** (cyan highlight, interactive)
- `stageIndex > currentIndex` → **future** (dimmed, non-interactive, lock notice on click)

```ts
const currentIndex = STAGE_ORDER.indexOf(currentStage);
const stageIndex   = STAGE_ORDER.indexOf(section.stage);
const isFuture     = stageIndex > currentIndex;
const isPast       = stageIndex < currentIndex;
```

---

## Accessibility Implementation

### Navigation links (`<a>`)
```tsx
aria-current={active ? "page" : undefined}
className="... focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
```

### Stage section wrappers
```tsx
role="group"
aria-label={section.label}
```

### Sidebar/drawer dividers
```tsx
role="separator"
```

### Mobile overlay
```tsx
role="dialog"
aria-modal="true"
aria-label="Navigation menu"
```

### Lock notice
```tsx
role="status"
aria-live="polite"
```

### Collapse toggle
```tsx
aria-expanded={!collapsed}
aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
```

### Locked nav items (future stages)
```tsx
role="button"
aria-disabled="true"
tabIndex={0}
onKeyDown={(e) => e.key === "Enter" && triggerLockNotice(section.stage)}
```

---

## Animation

All transitions use `max-height` CSS (not `height: auto`) to enable smooth collapse/expand:
```tsx
const dur = reducedMotion ? "none" : "max-height 0.3s ease";
style={{ maxHeight: show ? "600px" : "0px", overflow: "hidden",
         transition: reducedMotion ? "none" : `max-height 0.3s ease` }}
```

`usePrefersReducedMotion()` watches `prefers-reduced-motion: reduce` via `MediaQueryList`.

---

## Tablet Auto-Collapse

```tsx
useEffect(() => {
  function sync() { setCollapsed(window.innerWidth < 1024); }
  sync();
  window.addEventListener("resize", sync);
  return () => window.removeEventListener("resize", sync);
}, []);
```

Breakpoint: **1024 px** (matches Tailwind `lg:`).

---

## Lock Notice

3-second auto-dismiss toast rendered at bottom of sidebar:
```tsx
const lockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

function triggerLockNotice(stage: CareerOsStage) {
  setLockNotice(stage);
  if (lockTimer.current) clearTimeout(lockTimer.current);
  lockTimer.current = setTimeout(() => setLockNotice(null), 3000);
}
```

Styled with a `@keyframes fadeIn` CSS animation injected via `<style>` tag.

---

## Rollback Plan

If this sidebar causes a regression:

1. **Revert the commit:**
   ```bash
   git revert 6d838d5 --no-edit
   git push origin main
   ```
2. Vercel will auto-deploy the revert within ~60 seconds.
3. The previous sidebar commit is `b036944` — confirm with `git log --oneline src/components/AppSidebar.tsx`.

**Safe revert conditions:**
- Any stage not loading correctly
- Sidebar not visible in production
- CI failing on `test-secrets` or `Playwright E2E`

---

## Brand Token Reference

| Token | Hex | Usage |
|---|---|---|
| `brand-500` | `#00d9ff` | Active link text, focus rings, checkmark |
| `brand-600` | `#00a8cc` | Active link hover |
| `brand-50` | `#e5fbff` | Active link background |

Defined in `tailwind.config.ts`.

---

*Commit: `6d838d5` · Branch: `main` · Supabase: `kuneabeiwcxavvyyfjkx`*
