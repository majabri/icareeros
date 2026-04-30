"use client";

import { useEffect, useRef } from "react";

interface Particle { x: number; y: number; vx: number; vy: number; size: number; }

function initParticles(count: number, w: number, h: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w, y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.55, vy: (Math.random() - 0.5) * 0.55,
    size: Math.random() * 2 + 1,
  }));
}

export function HeroSection() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let animId: number;
    let particles: Particle[] = [];

    function resize() {
      if (!canvas) return;
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      particles = initParticles(90, canvas.width, canvas.height);
    }
    resize();

    function animate() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of particles) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(0,242,255,0.55)";
        ctx.fill();
      }
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d = Math.sqrt(dx * dx + dy * dy);
          if (d < 130) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,242,255,${0.18 * (1 - d / 130)})`;
            ctx.lineWidth = 0.7;
            ctx.stroke();
          }
        }
      }
      animId = requestAnimationFrame(animate);
    }
    animate();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    return () => { cancelAnimationFrame(animId); ro.disconnect(); };
  }, []);

  return (
    <section
      className="relative flex min-h-[92vh] items-center justify-center overflow-hidden"
      style={{ background: "linear-gradient(135deg,#050505,#071012 50%,#060606)" }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(0,242,255,0.07),transparent)]" />

      <div className="relative z-10 mx-auto max-w-4xl px-6 text-center">
        <span className="badge-brand mb-8 animate-fade-up">
          <span className="h-1.5 w-1.5 rounded-full bg-[#00f2ff]" />
          AI-Powered Career Operating System
        </span>

        <h1
          className="mb-6 animate-fade-up text-5xl font-black uppercase leading-none tracking-tight text-white sm:text-6xl lg:text-7xl"
          style={{ animationDelay: "0.05s" }}
        >
          Build Your Best Career —{" "}
          <span className="text-brand-gradient">Every Single Stage</span>
        </h1>

        <p
          className="mb-3 animate-fade-up text-xl font-semibold uppercase tracking-widest sm:text-2xl"
          style={{ color: "var(--brand)", animationDelay: "0.1s" }}
        >
          Your Career Transformation Starts Here
        </p>

        <p
          className="mx-auto mb-10 max-w-2xl animate-fade-up text-lg leading-relaxed sm:text-xl"
          style={{ color: "var(--text-secondary)", animationDelay: "0.15s" }}
        >
          iCareerOS is the only platform that guides you through every phase of your career —
          from first job to executive leadership — with personalized AI at every step.
        </p>

        <div
          className="flex animate-fade-up flex-col items-center gap-4 sm:flex-row sm:justify-center"
          style={{ animationDelay: "0.2s" }}
        >
          <a
            href="/auth/signup"
            className="bg-brand-gradient shadow-brand w-full rounded-xl px-9 py-4 text-base font-bold uppercase tracking-wide text-black transition hover:opacity-90 sm:w-auto"
          >
            Launch Your Journey →
          </a>
          <a
            href="#features"
            className="glass w-full rounded-xl px-9 py-4 text-base font-semibold uppercase tracking-wide text-white transition hover:border-[rgba(0,242,255,0.4)] sm:w-auto"
          >
            Explore Features
          </a>
        </div>

        <p className="mt-5 text-sm" style={{ color: "var(--text-muted)" }}>
          Free to start · No credit card required · 50,000+ careers transformed
        </p>
      </div>
    </section>
  );
}
