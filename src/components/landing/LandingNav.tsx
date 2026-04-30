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
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "border-b border-gray-100 bg-white/95 shadow-sm backdrop-blur-md"
          : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <a href="/" className="text-xl font-extrabold text-gray-900">
          iCareer
          <span
            className="bg-clip-text text-transparent"
            style={{ backgroundImage: "linear-gradient(135deg,#00d9ff,#4ecdc4)" }}
          >
            OS
          </span>
        </a>

        {/* Nav links */}
        <ul className="hidden items-center gap-8 text-sm font-medium text-gray-600 md:flex">
          <li>
            <a href="#lifecycle" className="transition hover:text-gray-900">
              How It Works
            </a>
          </li>
          <li>
            <a href="#features" className="transition hover:text-gray-900">
              Features
            </a>
          </li>
          <li>
            <a href="#faq" className="transition hover:text-gray-900">
              FAQ
            </a>
          </li>
          <li>
            <a href="#demo" className="transition hover:text-gray-900">
              Pricing
            </a>
          </li>
        </ul>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <a
            href="/auth/login"
            className="hidden text-sm font-medium text-gray-600 transition hover:text-gray-900 sm:block"
          >
            Sign In
          </a>
          <a
            href="/auth/signup"
            className="rounded-lg px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:opacity-90"
            style={{ background: "linear-gradient(135deg,#00d9ff,#4ecdc4)" }}
          >
            Get started free
          </a>
        </div>
      </div>
    </nav>
  );
}
