"use client";

import { useEffect, useRef } from "react";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
}

const PARTICLE_COLORS = ["#00d9ff", "#4ecdc4", "#ff6b6b", "#06b6d4", "#a78bfa"];

function initParticles(count: number, w: number, h: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    size: Math.random() * 2.5 + 1,
    color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
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
      particles = initParticles(70, canvas.width, canvas.height);
    }

    resize();

    function animate() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.4;
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(0,217,255,${0.12 * (1 - dist / 130)})`;
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

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
    };
  }, []);

  return (
    <section className="relative flex min-h-[92vh] items-center justify-center overflow-hidden bg-gradient-to-br from-slate-50 via-cyan-50/40 to-teal-50/60">
      {/* Constellation canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Soft radial glow */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_50%_0%,rgba(0,217,255,0.08),transparent)]" />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        {/* Pill badge */}
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/60 bg-white/80 px-4 py-1.5 text-sm font-semibold text-cyan-700 shadow-sm backdrop-blur-sm">
          <span className="h-2 w-2 rounded-full bg-cyan-400" />
          AI-Powered Career Operating System
        </span>

        <h1 className="mb-5 text-5xl font-extrabold leading-tight tracking-tight text-gray-900 sm:text-6xl lg:text-7xl">
          Build Your Best Career —{" "}
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg, #00d9ff 0%, #4ecdc4 50%, #ff6b6b 100%)" }}
          >
            Every Single Stage
          </span>
        </h1>

        <p className="mb-4 text-xl font-semibold tracking-wide text-gray-600 sm:text-2xl">
          Your Career Transformation Starts Here
        </p>

        <p className="mb-10 text-lg leading-relaxed text-gray-500 sm:text-xl">
          iCareerOS is the only platform that guides you through every phase of your career — from
          first job to executive leadership — with personalized AI at every step.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="/auth/signup"
            className="w-full rounded-xl px-9 py-4 text-base font-bold text-white shadow-lg transition hover:opacity-90 hover:shadow-cyan-400/30 sm:w-auto"
            style={{ background: "linear-gradient(135deg, #00d9ff 0%, #4ecdc4 100%)" }}
          >
            Launch Your Journey →
          </a>
          <a
            href="#features"
            className="w-full rounded-xl border border-gray-200 bg-white/80 px-9 py-4 text-base font-semibold text-gray-700 shadow-sm backdrop-blur-sm transition hover:border-cyan-300 hover:text-cyan-700 sm:w-auto"
          >
            Explore Features
          </a>
        </div>

        <p className="mt-5 text-sm text-gray-400">
          Free to start · No credit card required · 50,000+ careers transformed
        </p>
      </div>
    </section>
  );
}
