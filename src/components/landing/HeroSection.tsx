"use client";
import { useEffect, useRef } from "react";

const COLORS = ["#00d9ff","#00ff88","#ffff00","#ffa366","#ff6b6b"];

export function HeroSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    }
    resize();

    type P = { x:number; y:number; vx:number; vy:number; size:number; color:string; opacity:number; opacityDir:number };
    const pts: P[] = Array.from({ length: 100 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      size: Math.random() * 3 + 1.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      opacity: Math.random() * 0.6 + 0.4,
      opacityDir: (Math.random() - 0.5) * 0.03,
    }));

    let animId: number;
    function animate() {
      if (!canvas || !ctx) return;
      ctx.fillStyle = "rgba(245,247,255,0.95)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;
        p.opacity += p.opacityDir;
        if (p.opacity > 1) { p.opacity = 1; p.opacityDir *= -1; }
        if (p.opacity < 0.2) { p.opacity = 0.2; p.opacityDir *= -1; }

        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y;
          const d = Math.sqrt(dx*dx + dy*dy);
          if (d < 200) {
            ctx.globalAlpha = 0.2 * (1 - d / 200);
            ctx.strokeStyle = pts[i].color;
            ctx.lineWidth = 1;
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

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, []);

  return (
    <section style={{
      background: "linear-gradient(135deg,#f5f7ff 0%,#e8f5ff 50%,#fff5e8 100%)",
      position: "relative", padding: "6rem 3rem",
      textAlign: "center", minHeight: "100vh",
      display: "flex", alignItems: "center", justifyContent: "center",
      overflow: "hidden",
    }}>
      <canvas ref={canvasRef} style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", zIndex:1 }} />

      <div style={{ maxWidth: 900, position: "relative", zIndex: 2 }}>
        <div style={{ color:"var(--primary)", fontWeight:600, fontSize:"1rem", marginBottom:"1rem", textTransform:"uppercase", letterSpacing:"1px" }}>
          Your Career Transformation Starts Here
        </div>

        <h1 style={{ fontSize:"3.5rem", fontWeight:800, marginBottom:"1.5rem", lineHeight:1.2, letterSpacing:"-1px", color:"var(--neutral-900)" }}>
          Build Your Best Career —<br/>Every Single Stage
        </h1>

        <p style={{ fontSize:"1.25rem", marginBottom:"2.5rem", color:"var(--neutral-700)", maxWidth:700, marginLeft:"auto", marginRight:"auto", lineHeight:1.7 }}>
          From exploring possibilities to celebrating wins, iCareerOS guides you through every phase of your career journey with AI-powered insights, personalized learning, and human mentorship.
        </p>

        <div style={{ display:"flex", gap:"1.5rem", justifyContent:"center", flexWrap:"wrap" }}>
          <a href="#cta" className="btn btn-primary">Launch Your Journey →</a>
          <a href="#features" className="btn btn-secondary">Explore Features</a>
        </div>
      </div>
    </section>
  );
}
