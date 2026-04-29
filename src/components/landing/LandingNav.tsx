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
        scrolled ? "bg-gray-950/90 shadow-lg shadow-black/20 backdrop-blur-md" : "bg-transparent"
      }`}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        {/* Logo */}
        <a href="/" className="text-xl font-extrabold text-white">
          iCareer<span className="text-blue-400">OS</span>
        </a>

        {/* Nav links — hidden on small screens */}
        <ul className="hidden items-center gap-8 text-sm font-medium text-gray-300 md:flex">
          <li>
            <a href="#lifecycle" className="transition hover:text-white">
              How It Works
            </a>
          </li>
          <li>
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
          </li>
          <li>
            <a href="#demo" className="transition hover:text-white">
              Pricing
            </a>
          </li>
        </ul>

        {/* CTAs */}
        <div className="flex items-center gap-3">
          <a
            href="/auth/login"
            className="hidden text-sm font-medium text-gray-300 transition hover:text-white sm:block"
          >
            Sign In
          </a>
          <a
            href="/auth/signup"
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500"
          >
            Get started free
          </a>
        </div>
      </div>
    </nav>
  );
}
