"use client";
import * as React from "react";

function TooltipProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

interface TooltipProps {
  children: React.ReactNode;
}
function Tooltip({ children }: TooltipProps) {
  return <>{children}</>;
}

function TooltipTrigger({ children, asChild, ...props }: React.HTMLAttributes<HTMLSpanElement> & { asChild?: boolean }) {
  return <span {...props}>{children}</span>;
}

function TooltipContent({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["z-50 rounded-md bg-gray-900 px-2 py-1 text-xs text-white shadow-md", className].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
