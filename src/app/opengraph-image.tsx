/**
 * iCareerOS — OpenGraph image (1200×630).
 * Dynamic OG via next/og's ImageResponse — generated at build time and on
 * each request that needs a fresh URL. JSX-as-image, no static asset needed.
 *
 * Brand source of truth: docs/specs/logo-final-system.html.
 */

import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "iCareerOS — Your AI Career Operating System";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// ── Brand palette (mirrors docs/specs/logo-final-system.html) ─────────────
const TEAL  = "#00B8A9";
const CORAL = "#FF6B6B";
const GOLD  = "#F5A623";
const GREEN = "#10B981";
const NAVY  = "#0F1B2D";
const BG    = "#FAFBFF";
const GRAY  = "#64748B";
const TEAL3 = "hsl(172,70%,58%)";
const NAVY3 = "hsl(220,50%,65%)";

export default async function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: `linear-gradient(135deg, ${BG} 0%, #e8f5ff 50%, #fff5e8 100%)`,
          padding: 80,
        }}
      >
        {/* Hex icon — centered, 200×220 */}
        <svg width="220" height="220" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 40 }}>
          <rect width="220" height="220" rx="40" fill="#fff" stroke="hsl(220,60%,92%)" strokeWidth="2"/>
          <line x1="110" y1="22" x2="178" y2="62" stroke={TEAL}  strokeWidth="9" strokeLinecap="round"/>
          <line x1="178" y1="62" x2="178" y2="158" stroke={CORAL} strokeWidth="9" strokeLinecap="round"/>
          <line x1="178" y1="158" x2="110" y2="198" stroke={GOLD} strokeWidth="9" strokeLinecap="round"/>
          <line x1="110" y1="198" x2="42" y2="158" stroke={GREEN} strokeWidth="9" strokeLinecap="round"/>
          <line x1="42" y1="158" x2="42" y2="62" stroke={NAVY3} strokeWidth="9" strokeLinecap="round"/>
          <line x1="42" y1="62" x2="110" y2="22" stroke={TEAL3} strokeWidth="9" strokeLinecap="round"/>
          <text x="110" y="125" textAnchor="middle" fontFamily="Inter,sans-serif" fontSize="58" fontWeight="800" fill={NAVY} letterSpacing="-1">OS</text>
          <circle cx="110" cy="22" r="13"  fill={TEAL}/>
          <circle cx="178" cy="62" r="11"  fill={CORAL}/>
          <circle cx="178" cy="158" r="11" fill={GOLD}/>
          <circle cx="110" cy="198" r="13" fill={GREEN}/>
          <circle cx="42"  cy="158" r="11" fill={NAVY3}/>
          <circle cx="42"  cy="62"  r="11" fill={TEAL3}/>
        </svg>

        {/* Wordmark — colored letters per the system */}
        <div style={{ display: "flex", fontFamily: "Inter, sans-serif", fontSize: 96, fontWeight: 800, letterSpacing: -2, lineHeight: 1 }}>
          <span style={{ color: TEAL }}>i</span>
          <span style={{ color: NAVY }}>C</span>
          <span style={{ color: TEAL3 }}>a</span>
          <span style={{ color: CORAL }}>r</span>
          <span style={{ color: GOLD }}>e</span>
          <span style={{ color: GREEN }}>e</span>
          <span style={{ color: NAVY3 }}>r</span>
          <span style={{ color: CORAL }}>O</span>
          <span style={{ color: TEAL }}>S</span>
        </div>

        {/* Tagline */}
        <div
          style={{
            display: "flex",
            marginTop: 24,
            color: GRAY,
            fontFamily: "Inter, sans-serif",
            fontSize: 26,
            letterSpacing: 4,
            textTransform: "uppercase",
            fontWeight: 500,
          }}
        >
          YOUR AI CAREER OPERATING SYSTEM
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
