"use client";

import type { SubscriptionPlan } from "@/services/billing/types";

interface PlanBadgeProps {
  plan: SubscriptionPlan;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const PLAN_CONFIG: Record<
  SubscriptionPlan,
  { label: string; bg: string; text: string; ring: string }
> = {
  free: {
    label: "Free",
    bg: "bg-gray-100",
    text: "text-gray-600",
    ring: "ring-gray-200",
  },
  premium: {
    label: "Premium",
    bg: "bg-blue-50",
    text: "text-blue-700",
    ring: "ring-blue-200",
  },
  professional: {
    label: "Professional",
    bg: "bg-amber-50",
    text: "text-amber-700",
    ring: "ring-amber-200",
  },
};

const SIZE_CLASSES = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-1 text-sm",
  lg: "px-3 py-1.5 text-base",
};

export function PlanBadge({ plan, size = "md", className = "" }: PlanBadgeProps) {
  const { label, bg, text, ring } = PLAN_CONFIG[plan];

  return (
    <span
      className={`
        inline-flex items-center font-semibold rounded-full ring-1
        ${bg} ${text} ${ring} ${SIZE_CLASSES[size]} ${className}
      `}
      aria-label={`Current plan: ${label}`}
    >
      {plan !== "free" && (
        <svg
          className="mr-1 h-3 w-3 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      )}
      {label}
    </span>
  );
}
