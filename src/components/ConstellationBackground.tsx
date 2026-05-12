"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#00d9ff", "#00ff88", "#ffff00", "#ffa366", "#ff6b6b"];

// ── Connection-flash tuning ─────────────────────────────────────────────────
// CONNECT_DIST: distance below which two particles are considered "connected"
// and a line is drawn between them. Same value as before (200px).
// FLASH_MS: how long the per-line flash effect lasts after the connect event.
// 280ms ≈ 17 frames at 60fps — long enough to register, short enough to feel
// snappy and not tail off.
const CONNECT_DIST     = 200;          // px — same threshold for line drawing + flash trigger
const FLASH_PROB       = 0.25;         // only ~25% of new connections actually flash; rest are silent
const FLASH_MS         = 350;          // settled fade — slightly longer than a sharp pop

/**
 * Full-screen fixed constellation canvas — sits behind all page content.
 *
 * Animation:
 *   • 120 colored particles drift across the viewport
 *   • Pairs within CONNECT_DIST are joined by a line whose opacity
 *     scales with how close they are (smooth fade in / fade out)
 *   • When a pair CROSSES the threshold from outside → inside, a flash
 *     is triggered on that line: brief boost in alpha + line width +
 *     a white overlay stroke that decays ease-out over FLASH_MS
 *
 * The flash event fires once per "connect"; nothing happens on disconnect
 * (the smooth distance-fade handles that direction).
 */
export function ConstellationBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width  = window.innerWidth;
      canvas.height = window.innerHeight;
    }
    resize();

    type P = {
      x: number; y: number; vx: number; vy: number;
      size: number; color: string; opacity: number; opacityDir: number;
    };

    const N = 120;

    const pts: P[] = Array.from({ length: N }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.7,
      size: Math.random() * 3 + 1.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      opacity: Math.random() * 0.6 + 0.3,
      opacityDir: (Math.random() - 0.5) * 0.025,
    }));

    // Per-pair previous-frame distance, indexed by (i * N + j) for i<j.
    // Used to detect the "outside → inside" transition that triggers a flash.
    // Initialized to Infinity so the first frame can't false-fire connections.
    const lastDist = new Float32Array(N * N).fill(Infinity);

    // Flash registry: key "i-j" → timestamp (ms) when the connect happened.
    // Entries are removed when their flash fully decays (now - ts > FLASH_MS).
    const flashes = new Map<string, number>();

    let animId: number;

    function animate() {
      if (!canvas || !ctx) return;
      const now = performance.now();

      // Theme-aware motion-blur trail. Light = pastel wash. Dark =
      // brand-navy wash matching --surface-page #0F1B2D so the field's
      // perceived bg converges to the topbar/sidebar color.
      const isDark = document.documentElement.getAttribute("data-theme") === "dark";
      ctx.fillStyle = isDark ? "rgba(15, 27, 45, 0.85)" : "rgba(245, 247, 255, 0.78)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // ── 1. Move + draw each particle ─────────────────────────────────────
      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0)             p.x = canvas.width;
        if (p.x > canvas.width)  p.x = 0;
        if (p.y < 0)             p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        p.opacity += p.opacityDir;
        if (p.opacity > 0.9) { p.opacity = 0.9; p.opacityDir *= -1; }
        if (p.opacity < 0.2) { p.opacity = 0.2; p.opacityDir *= -1; }

        ctx.globalAlpha = p.opacity;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // ── 2. Connection lines + flash detection ────────────────────────────
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);

          const idx  = i * N + j;
          const dPrev = lastDist[idx];

          // Edge detect: was OUTSIDE last frame, now INSIDE → maybe spawn a flash.
          // FLASH_PROB gates how often the flash visibly fires; the rest of the
          // time the line just appears via the normal distance-fade. Keeps the
          // animation feeling alive without becoming busy.
          if (dPrev > CONNECT_DIST && d <= CONNECT_DIST && Math.random() < FLASH_PROB) {
            flashes.set(`${i}-${j}`, now);
          }
          lastDist[idx] = d;

          if (d >= CONNECT_DIST) continue;

          // Base line: distance-faded, particle-tinted.
          const baseAlpha = 0.22 * (1 - d / CONNECT_DIST);

          // Flash overlay: ease-out curve, decays to 0 over FLASH_MS.
          let flashT = 0;
          const flashStart = flashes.get(`${i}-${j}`);
          if (flashStart != null) {
            const elapsed = now - flashStart;
            if (elapsed >= FLASH_MS) {
              flashes.delete(`${i}-${j}`);
            } else {
              const t = 1 - elapsed / FLASH_MS;
              flashT = t * t; // ease-out (faster decay at the start)
            }
          }

          // Stroke 1: the steady particle-color line, alpha-boosted by flash.
          ctx.globalAlpha = Math.min(1, baseAlpha + flashT * 0.22);  // gentler lift, was 0.55
          ctx.strokeStyle = pts[i].color;
          ctx.lineWidth   = 0.9 + flashT * 0.5;                     // 0.9 → 1.4px max, was 0.9 → 2.3px
          ctx.beginPath();
          ctx.moveTo(pts[i].x, pts[i].y);
          ctx.lineTo(pts[j].x, pts[j].y);
          ctx.stroke();

          // Stroke 2: a thinner, brighter white overlay only during the flash.
          // Gives the visual sensation of the line "lighting up" on connect
          // before settling back to its calm steady state.
          if (flashT > 0.01) {
            ctx.globalAlpha = 0.35 * flashT;                          // dimmer overlay, was 0.85
            ctx.strokeStyle = "#FFFFFF";
            ctx.lineWidth   = 0.5 + flashT * 0.3;                     // narrower, was 0.6 + 0.8
            ctx.beginPath();
            ctx.moveTo(pts[i].x, pts[i].y);
            ctx.lineTo(pts[j].x, pts[j].y);
            ctx.stroke();
          }
        }
      }

      ctx.globalAlpha = 1;
      animId = requestAnimationFrame(animate);
    }

    animate();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position:      "fixed",
        inset:         0,
        width:         "100%",
        height:        "100%",
        zIndex:        0,
        pointerEvents: "none",
      }}
    />
  );
}
