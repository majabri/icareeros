"use client";

import { useEffect, useState } from "react";

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="fixed inset-x-0 top-0 z-50 transition-all duration-300"
      style={{
        background: scrolled ? "rgba(5,5,5,0.92)" : "transparent",
        backdropFilter: scrolled ? "blur(16px)" : "none",
        borderBottom: scrolled ? "1px solid rgba(0,242,255,0.12)" : "1px solid transparent",
      }}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <a href="/" className="text-xl font-black uppercase tracking-tight text-white">
          iCareer<span className="text-brand-gradient">OS</span>
        </a>

        {/* Nav links */}
        <ul className="hidden items-center gap-8 text-xs font-bold uppercase tracking-widest md:flex" style={{ color: "var(--text-secondary)" }}>
          <li><a href="#lifecycle" className="transition hover:text-white">How It Works</a></li>
          <li><a href="#features"  className="transition hover:text-white">Features</a></li>
          <li><a href="#faq"       className="transition hover:text-white">FAQ</a></li>
          <li><a href="#demo"      className="transition hover:text-white">Pricing</a></li>
        </ul>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <a
            href="/auth/login"
            className="hidden text-xs font-bold uppercase tracking-widest transition hover:text-white sm:block"
            style={{ color: "var(--text-secondary)" }}
          >
            Sign In
          </a>
          <a
            href="/auth/signup"
            className="bg-brand-gradient rounded-lg px-4 py-2 text-xs font-black uppercase tracking-widest text-black shadow-sm transition hover:opacity-90"
          >
            Get started free
          </a>
        </div>
      </div>
    </nav>
  );
}
