/**
 * iCareerOS — Logo component.
 * Source of truth: docs/specs/logo-final-system.html (Cowork prelaunch master brief, Wave 4).
 *
 * Renders BOTH light- and dark-mode SVGs inline. The dark variant is hidden
 * by default and shown when an ancestor element has [data-theme='dark'].
 *
 * SVG shapes are pasted verbatim from the approved logo system — do not
 * recreate them. Only the wrapping <span> + visibility toggle is component code.
 */

interface LogoProps {
  /**
   * "horizontal" — the full 340×72 logo (hex icon + colored wordmark + tagline).
   * "icon" — the square hex icon, sized via the `size` prop (default 32).
   */
  variant?: "horizontal" | "icon";
  /** Pixel size for the `icon` variant. Default 32. */
  size?: 16 | 32 | 48 | 80;
  /** Optional className for the outer wrapper. */
  className?: string;
  /** Optional inline width override for the horizontal variant. Default keeps the SVG's intrinsic 340×72 aspect ratio. */
  width?: number | string;
  /** Aria label override. */
  ariaLabel?: string;
}

const LOGO_TAGLINE = "YOUR AI CAREER OPERATING SYSTEM";

export function Logo({
  variant = "horizontal",
  size = 32,
  className = "",
  width,
  ariaLabel = "iCareerOS",
}: LogoProps) {
  const wrapperClass = `icareeros-logo icareeros-logo--${variant} ${className}`.trim();

  return (
    <span
      className={wrapperClass}
      role="img"
      aria-label={ariaLabel}
      style={{ display: "inline-flex", lineHeight: 0 }}
    >
      <LogoStyleScope />
      {variant === "horizontal" ? (
        <>
          <span className="icareeros-logo__light" aria-hidden={false}>
            <HorizontalLight width={width} />
          </span>
          <span className="icareeros-logo__dark" aria-hidden={true}>
            <HorizontalDark width={width} />
          </span>
        </>
      ) : (
        <>
          <span className="icareeros-logo__light" aria-hidden={false}>
            <IconLight size={size} />
          </span>
          <span className="icareeros-logo__dark" aria-hidden={true}>
            <IconDark size={size} />
          </span>
        </>
      )}
    </span>
  );
}

/**
 * One-time scoped style block. Hides the dark variant by default; flips
 * visibility when an ancestor has [data-theme='dark']. Uses display rather
 * than visibility so the inactive variant takes no space.
 *
 * Rendered once per Logo instance — that's fine, scoped styles dedupe
 * trivially in the browser, and the cost is a single ~250-byte <style> tag.
 */
function LogoStyleScope() {
  return (
    <style>{`
      .icareeros-logo__dark { display: none; }
      [data-theme='dark'] .icareeros-logo__light { display: none; }
      [data-theme='dark'] .icareeros-logo__dark  { display: inline-flex; }
    `}</style>
  );
}

// ─── Horizontal variant (340×72) — exact SVG from logo-final-system.html ────

function HorizontalLight({ width }: { width?: number | string }) {
  // Source: docs/specs/logo-final-system.html lines 76–96 (Light · On white).
  return (
    <svg width={width ?? 340} height={width ? undefined : 72} viewBox="0 0 340 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="24" y1="4"  x2="43" y2="15" stroke="#00B8A9" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="43" y1="15" x2="43" y2="37" stroke="#FF6B6B" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="43" y1="37" x2="24" y2="48" stroke="#F5A623" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="24" y1="48" x2="5"  y2="37" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="5"  y1="37" x2="5"  y2="15" stroke="hsl(220,50%,65%)" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="5"  y1="15" x2="24" y2="4"  stroke="hsl(172,70%,58%)" strokeWidth="2.5" strokeLinecap="round"/>
      <text x="24" y="31" textAnchor="middle" fontFamily="Inter,system-ui,sans-serif" fontSize="12" fontWeight="800" fill="#0F1B2D" letterSpacing="-0.2">OS</text>
      <circle cx="24" cy="4"  r="3.8" fill="#00B8A9"/>
      <circle cx="43" cy="15" r="3.2" fill="#FF6B6B"/>
      <circle cx="43" cy="37" r="3.2" fill="#F5A623"/>
      <circle cx="24" cy="48" r="3.8" fill="#10B981"/>
      <circle cx="5"  cy="37" r="3.2" fill="hsl(220,50%,65%)"/>
      <circle cx="5"  cy="15" r="3.2" fill="hsl(172,70%,58%)"/>
      <text x="62" y="38" fontFamily="Inter,system-ui,sans-serif" fontSize="30" fontWeight="800">
        <tspan fill="#00B8A9">i</tspan><tspan fill="#0F1B2D">C</tspan><tspan fill="hsl(172,70%,58%)">a</tspan><tspan fill="#FF6B6B">r</tspan><tspan fill="#F5A623">e</tspan><tspan fill="#10B981">e</tspan><tspan fill="hsl(220,50%,65%)">r</tspan><tspan fill="#FF6B6B">O</tspan><tspan fill="#00B8A9">S</tspan>
      </text>
      <text x="62" y="56" fontFamily="Inter,system-ui,sans-serif" fontSize="8.5" fill="#64748B" letterSpacing="0.13em">{LOGO_TAGLINE}</text>
    </svg>
  );
}

function HorizontalDark({ width }: { width?: number | string }) {
  // Source: docs/specs/logo-final-system.html lines 229–249 (Dark · On navy).
  return (
    <svg width={width ?? 340} height={width ? undefined : 72} viewBox="0 0 340 72" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="24" y1="4"  x2="43" y2="15" stroke="hsl(172,70%,72%)" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="43" y1="15" x2="43" y2="37" stroke="#fca5a5" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="43" y1="37" x2="24" y2="48" stroke="#fcd34d" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="24" y1="48" x2="5"  y2="37" stroke="#6ee7b7" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="5"  y1="37" x2="5"  y2="15" stroke="hsl(220,55%,75%)" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="5"  y1="15" x2="24" y2="4"  stroke="hsl(172,70%,75%)" strokeWidth="2.5" strokeLinecap="round"/>
      <text x="24" y="31" textAnchor="middle" fontFamily="Inter,system-ui,sans-serif" fontSize="12" fontWeight="800" fill="white">OS</text>
      <circle cx="24" cy="4"  r="3.8" fill="hsl(172,70%,72%)"/>
      <circle cx="43" cy="15" r="3.2" fill="#fca5a5"/>
      <circle cx="43" cy="37" r="3.2" fill="#fcd34d"/>
      <circle cx="24" cy="48" r="3.8" fill="#6ee7b7"/>
      <circle cx="5"  cy="37" r="3.2" fill="hsl(220,55%,75%)"/>
      <circle cx="5"  cy="15" r="3.2" fill="hsl(172,70%,75%)"/>
      <text x="62" y="38" fontFamily="Inter,system-ui,sans-serif" fontSize="30" fontWeight="800">
        <tspan fill="hsl(172,70%,72%)">i</tspan><tspan fill="hsl(220,55%,80%)">C</tspan><tspan fill="hsl(172,70%,75%)">a</tspan><tspan fill="#fca5a5">r</tspan><tspan fill="#fcd34d">e</tspan><tspan fill="#6ee7b7">e</tspan><tspan fill="hsl(220,55%,75%)">r</tspan><tspan fill="#fca5a5">O</tspan><tspan fill="hsl(172,70%,72%)">S</tspan>
      </text>
      <text x="62" y="56" fontFamily="Inter,system-ui,sans-serif" fontSize="8.5" fill="hsl(220,50%,45%)" letterSpacing="0.13em">{LOGO_TAGLINE}</text>
    </svg>
  );
}

// ─── Icon variant (square hex) ──────────────────────────────────────────────
// Sources by size:
//   80 — logo-final-system.html lines 131–146 (light) / 259–274 (dark)
//   48 — lines 151–166 (light) / 279–294 (dark)
//   32 — lines 171–186 (light) / 299–314 (dark)
//   16 — lines 191–195 (light) / 319–323 (dark) — favicon-style minimal "OS"

function IconLight({ size }: { size: number }) {
  switch (size) {
    case 80: return <Icon80Light />;
    case 48: return <Icon48Light />;
    case 16: return <Icon16Light />;
    default: return <Icon32Light />;
  }
}

function IconDark({ size }: { size: number }) {
  switch (size) {
    case 80: return <Icon80Dark />;
    case 48: return <Icon48Dark />;
    case 16: return <Icon16Dark />;
    default: return <Icon32Dark />;
  }
}

function Icon80Light() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="18" fill="#fff" stroke="hsl(220,60%,92%)" strokeWidth="1"/>
      <line x1="40" y1="10" x2="63" y2="23" stroke="#00B8A9" strokeWidth="3" strokeLinecap="round"/>
      <line x1="63" y1="23" x2="63" y2="49" stroke="#FF6B6B" strokeWidth="3" strokeLinecap="round"/>
      <line x1="63" y1="49" x2="40" y2="62" stroke="#F5A623" strokeWidth="3" strokeLinecap="round"/>
      <line x1="40" y1="62" x2="17" y2="49" stroke="#10B981" strokeWidth="3" strokeLinecap="round"/>
      <line x1="17" y1="49" x2="17" y2="23" stroke="hsl(220,50%,65%)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="17" y1="23" x2="40" y2="10" stroke="hsl(172,70%,58%)" strokeWidth="3" strokeLinecap="round"/>
      <text x="40" y="46" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="20" fontWeight="800" fill="#0F1B2D" letterSpacing="-0.4">OS</text>
      <circle cx="40" cy="10" r="4.5" fill="#00B8A9"/>
      <circle cx="63" cy="23" r="3.5" fill="#FF6B6B"/>
      <circle cx="63" cy="49" r="3.5" fill="#F5A623"/>
      <circle cx="40" cy="62" r="4.5" fill="#10B981"/>
      <circle cx="17" cy="49" r="3.5" fill="hsl(220,50%,65%)"/>
      <circle cx="17" cy="23" r="3.5" fill="hsl(172,70%,58%)"/>
    </svg>
  );
}
function Icon80Dark() {
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="80" height="80" rx="18" fill="#0F1B2D" stroke="hsl(220,65%,18%)" strokeWidth="1"/>
      <line x1="40" y1="10" x2="63" y2="23" stroke="hsl(172,70%,72%)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="63" y1="23" x2="63" y2="49" stroke="#fca5a5" strokeWidth="3" strokeLinecap="round"/>
      <line x1="63" y1="49" x2="40" y2="62" stroke="#fcd34d" strokeWidth="3" strokeLinecap="round"/>
      <line x1="40" y1="62" x2="17" y2="49" stroke="#6ee7b7" strokeWidth="3" strokeLinecap="round"/>
      <line x1="17" y1="49" x2="17" y2="23" stroke="hsl(220,55%,75%)" strokeWidth="3" strokeLinecap="round"/>
      <line x1="17" y1="23" x2="40" y2="10" stroke="hsl(172,70%,75%)" strokeWidth="3" strokeLinecap="round"/>
      <text x="40" y="46" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="20" fontWeight="800" fill="white" letterSpacing="-0.4">OS</text>
      <circle cx="40" cy="10" r="4.5" fill="hsl(172,70%,72%)"/>
      <circle cx="63" cy="23" r="3.5" fill="#fca5a5"/>
      <circle cx="63" cy="49" r="3.5" fill="#fcd34d"/>
      <circle cx="40" cy="62" r="4.5" fill="#6ee7b7"/>
      <circle cx="17" cy="49" r="3.5" fill="hsl(220,55%,75%)"/>
      <circle cx="17" cy="23" r="3.5" fill="hsl(172,70%,75%)"/>
    </svg>
  );
}
function Icon48Light() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="11" fill="#fff" stroke="hsl(220,60%,92%)" strokeWidth="1"/>
      <line x1="24" y1="7"  x2="38" y2="15" stroke="#00B8A9" strokeWidth="2" strokeLinecap="round"/>
      <line x1="38" y1="15" x2="38" y2="31" stroke="#FF6B6B" strokeWidth="2" strokeLinecap="round"/>
      <line x1="38" y1="31" x2="24" y2="39" stroke="#F5A623" strokeWidth="2" strokeLinecap="round"/>
      <line x1="24" y1="39" x2="10" y2="31" stroke="#10B981" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="31" x2="10" y2="15" stroke="hsl(220,50%,65%)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="15" x2="24" y2="7"  stroke="hsl(172,70%,58%)" strokeWidth="2" strokeLinecap="round"/>
      <text x="24" y="28" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="12" fontWeight="800" fill="#0F1B2D">OS</text>
      <circle cx="24" cy="7"  r="3"   fill="#00B8A9"/>
      <circle cx="38" cy="15" r="2.5" fill="#FF6B6B"/>
      <circle cx="38" cy="31" r="2.5" fill="#F5A623"/>
      <circle cx="24" cy="39" r="3"   fill="#10B981"/>
      <circle cx="10" cy="31" r="2.5" fill="hsl(220,50%,65%)"/>
      <circle cx="10" cy="15" r="2.5" fill="hsl(172,70%,58%)"/>
    </svg>
  );
}
function Icon48Dark() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="48" height="48" rx="11" fill="#0F1B2D" stroke="hsl(220,65%,18%)" strokeWidth="1"/>
      <line x1="24" y1="7"  x2="38" y2="15" stroke="hsl(172,70%,72%)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="38" y1="15" x2="38" y2="31" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round"/>
      <line x1="38" y1="31" x2="24" y2="39" stroke="#fcd34d" strokeWidth="2" strokeLinecap="round"/>
      <line x1="24" y1="39" x2="10" y2="31" stroke="#6ee7b7" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="31" x2="10" y2="15" stroke="hsl(220,55%,75%)" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="15" x2="24" y2="7"  stroke="hsl(172,70%,75%)" strokeWidth="2" strokeLinecap="round"/>
      <text x="24" y="28" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="12" fontWeight="800" fill="white">OS</text>
      <circle cx="24" cy="7"  r="3"   fill="hsl(172,70%,72%)"/>
      <circle cx="38" cy="15" r="2.5" fill="#fca5a5"/>
      <circle cx="38" cy="31" r="2.5" fill="#fcd34d"/>
      <circle cx="24" cy="39" r="3"   fill="#6ee7b7"/>
      <circle cx="10" cy="31" r="2.5" fill="hsl(220,55%,75%)"/>
      <circle cx="10" cy="15" r="2.5" fill="hsl(172,70%,75%)"/>
    </svg>
  );
}
function Icon32Light() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#fff" stroke="hsl(220,60%,92%)" strokeWidth="1"/>
      <line x1="16" y1="5"  x2="26" y2="10.5" stroke="#00B8A9" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="26" y1="10.5" x2="26" y2="21.5" stroke="#FF6B6B" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="26" y1="21.5" x2="16" y2="27" stroke="#F5A623" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="16" y1="27" x2="6"  y2="21.5" stroke="#10B981" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="6"  y1="21.5" x2="6"  y2="10.5" stroke="hsl(220,50%,65%)" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="6"  y1="10.5" x2="16" y2="5"  stroke="hsl(172,70%,58%)" strokeWidth="1.8" strokeLinecap="round"/>
      <text x="16" y="20" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="8.5" fontWeight="800" fill="#0F1B2D">OS</text>
      <circle cx="16" cy="5"    r="2.2" fill="#00B8A9"/>
      <circle cx="26" cy="10.5" r="1.8" fill="#FF6B6B"/>
      <circle cx="26" cy="21.5" r="1.8" fill="#F5A623"/>
      <circle cx="16" cy="27"   r="2.2" fill="#10B981"/>
      <circle cx="6"  cy="21.5" r="1.8" fill="hsl(220,50%,65%)"/>
      <circle cx="6"  cy="10.5" r="1.8" fill="hsl(172,70%,58%)"/>
    </svg>
  );
}
function Icon32Dark() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="32" height="32" rx="7" fill="#0F1B2D" stroke="hsl(220,65%,18%)" strokeWidth="1"/>
      <line x1="16" y1="5"  x2="26" y2="10.5" stroke="hsl(172,70%,72%)" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="26" y1="10.5" x2="26" y2="21.5" stroke="#fca5a5" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="26" y1="21.5" x2="16" y2="27" stroke="#fcd34d" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="16" y1="27" x2="6"  y2="21.5" stroke="#6ee7b7" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="6"  y1="21.5" x2="6"  y2="10.5" stroke="hsl(220,55%,75%)" strokeWidth="1.8" strokeLinecap="round"/>
      <line x1="6"  y1="10.5" x2="16" y2="5"  stroke="hsl(172,70%,75%)" strokeWidth="1.8" strokeLinecap="round"/>
      <text x="16" y="20" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="8.5" fontWeight="800" fill="white">OS</text>
      <circle cx="16" cy="5"    r="2.2" fill="hsl(172,70%,72%)"/>
      <circle cx="26" cy="10.5" r="1.8" fill="#fca5a5"/>
      <circle cx="26" cy="21.5" r="1.8" fill="#fcd34d"/>
      <circle cx="16" cy="27"   r="2.2" fill="#6ee7b7"/>
      <circle cx="6"  cy="21.5" r="1.8" fill="hsl(220,55%,75%)"/>
      <circle cx="6"  cy="10.5" r="1.8" fill="hsl(172,70%,75%)"/>
    </svg>
  );
}

function Icon16Light() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" rx="3.5" fill="#fff" stroke="hsl(220,60%,92%)" strokeWidth="1"/>
      <text x="8" y="12" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="6.5" fontWeight="900" fill="#00B8A9">OS</text>
    </svg>
  );
}
function Icon16Dark() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="16" height="16" rx="3.5" fill="#0F1B2D"/>
      <text x="8" y="12" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="6.5" fontWeight="900" fill="hsl(172,70%,72%)">OS</text>
    </svg>
  );
}

export default Logo;
