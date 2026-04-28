"use client";
import * as React from "react";

function DropdownMenu({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}

function DropdownMenuTrigger({ children, asChild, ...props }: React.HTMLAttributes<HTMLDivElement> & { asChild?: boolean }) {
  return <div {...props}>{children}</div>;
}

function DropdownMenuContent({ children, className = "", align, ...props }: React.HTMLAttributes<HTMLDivElement> & { align?: string }) {
  return (
    <div
      className={["z-50 min-w-32 rounded-md border border-gray-200 bg-white p-1 shadow-md", className].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

function DropdownMenuItem({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={["flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm hover:bg-gray-100", className].join(" ")}
      {...props}
    >
      {children}
    </div>
  );
}

function DropdownMenuLabel({ children, className = "", ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={["px-2 py-1.5 text-xs font-semibold text-gray-500", className].join(" ")} {...props}>{children}</div>;
}

function DropdownMenuSeparator({ className = "", ...props }: React.HTMLAttributes<HTMLHRElement>) {
  return <hr className={["-mx-1 my-1 border-gray-200", className].join(" ")} {...props} />;
}

export { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator };
