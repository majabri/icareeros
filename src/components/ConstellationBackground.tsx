"use client";

import { useEffect, useRef } from "react";

const COLORS = ["#00d9ff", "#00ff88", "#ffff00", "#ffa366", "#ff6b6b"];

/**
 * Full-screen fixed constellation canvas — sits behind all page content.
 * Matches the HeroSection animation from the landing page, tuned for app-wide use.
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

    // 120 particles — same density as the landing hero
    const pts: P[] = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.7,
      vy: (Math.random() - 0.5) * 0.7,
      size: Math.random() * 3 + 1.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      opacity: Math.random() * 0.6 + 0.3,
      opacityDir: (Math.random() - 0.5) * 0.025,
    }));

    let animId: number;

    function animate() {
      if (!canvas || !ctx) return;

      // Low-opacity fill = long vivid trails (matches landing page feel)
      ctx.fillStyle = "rgba(245, 247, 255, 0.78)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const p of pts) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width)  p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        p.opacity += p.opacityDir;
        if (p.opacity > 0.9)  { p.opacity = 0.9;  p.opacityDir *= -1; }
        if (p.opacity < 0.2)  { p.opacity = 0.2;  p.opacityDir *= -1; }

        ctx.globalAlpha = p.opacity;
        ctx.fillStyle   = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      // Connecting lines — more visible than before
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x;
          const dy = pts[i].y - pts[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < 200) {
            ctx.globalAlpha  = 0.22 * (1 - d / 200);
            ctx.strokeStyle  = pts[i].color;
            ctx.lineWidth    = 0.9;
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
