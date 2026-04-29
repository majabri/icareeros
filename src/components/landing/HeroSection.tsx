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

const PARTICLE_COLORS = ["#60a5fa", "#a78bfa", "#34d399", "#f472b6", "#fbbf24"];

function initParticles(count: number, w: number, h: number): Particle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    vx: (Math.random() - 0.5) * 0.6,
    vy: (Math.random() - 0.5) * 0.6,
    size: Math.random() * 2 + 1,
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
      particles = initParticles(80, canvas.width, canvas.height);
    }

    resize();

    function animate() {
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        // Move
        p.x += p.vx;
        p.y += p.vy;
        // Bounce
        if (p.x < 0 || p.x > canvas.width) p.vx *= -1;
        if (p.y < 0 || p.y > canvas.height) p.vy *= -1;

        // Draw dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = 0.8;
        ctx.fill();
      }

      // Draw connecting lines
      ctx.globalAlpha = 1;
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.strokeStyle = `rgba(148, 163, 184, ${0.15 * (1 - dist / 140)})`;
            ctx.lineWidth = 0.8;
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
    <section className="relative flex min-h-[90vh] items-center justify-center overflow-hidden bg-gray-950">
      {/* Constellation canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-blue-950/60 via-gray-950/40 to-gray-950/80" />

      {/* Content */}
      <div className="relative z-10 mx-auto max-w-3xl px-6 text-center">
        {/* Pill badge */}
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-4 py-1.5 text-sm font-medium text-blue-300">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
          AI-Powered Career Operating System
        </span>

        <h1 className="mb-6 text-5xl font-extrabold leading-tight tracking-tight text-white sm:text-6xl lg:text-7xl">
          Your Career,{" "}
          <span className="bg-gradient-to-r from-blue-400 to-violet-400 bg-clip-text text-transparent">
            Guided at Every Stage
          </span>
        </h1>

        <p className="mb-10 text-lg leading-relaxed text-gray-300 sm:text-xl">
          From self-discovery to your next promotion — iCareerOS walks you through
          a full career lifecycle with personalized AI guidance at every step.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <a
            href="/auth/signup"
            className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg transition hover:from-blue-500 hover:to-violet-500 hover:shadow-blue-500/25 sm:w-auto"
          >
            Begin Your Free Career Assessment
          </a>
          <a
            href="/auth/login"
            className="w-full rounded-xl border border-gray-600 px-8 py-3.5 text-base font-medium text-gray-300 transition hover:border-gray-400 hover:text-white sm:w-auto"
          >
            Sign In
          </a>
        </div>

        <p className="mt-5 text-sm text-gray-500">
          Free to start · No credit card required
        </p>
      </div>
    </section>
  );
}
