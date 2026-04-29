"use client";

import { useEffect, useRef, useState } from "react";

const STATS = [
  { value: 6, unit: "", label: "Career OS Stages", suffix: "" },
  { value: 80, unit: "%", label: "of users report clarity within first cycle", suffix: "" },
  { value: 120, unit: "d", label: "median time to first measurable outcome", suffix: "" },
  { value: 15, unit: "%", label: "avg salary increase after 2 cycles", suffix: "+" },
];

function useCountUp(target: number, active: boolean) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!active) return;
    let start = 0;
    const duration = 1600;
    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setCount(Math.floor(eased * target));
      if (progress < 1) requestAnimationFrame(step);
      else setCount(target);
    };
    requestAnimationFrame(step);
  }, [active, target]);

  return count;
}

function StatCard({ stat, active }: { stat: typeof STATS[0]; active: boolean }) {
  const count = useCountUp(stat.value, active);
  return (
    <div className="text-center">
      <div className="mb-1 text-5xl font-extrabold tabular-nums text-white">
        {stat.suffix}{count}{stat.unit}
      </div>
      <p className="text-sm leading-snug text-blue-200">{stat.label}</p>
    </div>
  );
}

export function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); io.disconnect(); } },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={ref}
      className="bg-gradient-to-br from-blue-700 via-blue-800 to-violet-900 py-20"
    >
      <div className="mx-auto max-w-5xl px-6">
        <div className="grid gap-12 sm:grid-cols-2 lg:grid-cols-4">
          {STATS.map((s) => (
            <StatCard key={s.label} stat={s} active={visible} />
          ))}
        </div>
      </div>
    </section>
  );
}
