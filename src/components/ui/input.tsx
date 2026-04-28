import * as React from "react";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className = "", type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={[
        "flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm",
        "placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      ].join(" ")}
      {...props}
    />
  )
);
Input.displayName = "Input";

export { Input };
