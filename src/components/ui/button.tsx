import type { ButtonHTMLAttributes } from "react";
import { Spinner } from "./spinner";

const VARIANTS = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover",
  secondary: "border border-border-strong bg-surface text-text hover:bg-surface-muted",
  ghost: "text-text hover:bg-surface-muted",
  ghostDanger: "text-danger hover:bg-danger-soft",
  danger: "border border-danger bg-surface text-danger hover:bg-danger-soft",
} as const;

const SIZES = {
  md: "h-11 px-4 text-sm",
  sm: "h-9 px-3 text-sm",
} as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
};

export function buttonClass(variant: keyof typeof VARIANTS = "primary", size: keyof typeof SIZES = "md") {
  return `inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANTS[variant]} ${SIZES[size]}`;
}

export function Button({ loading, variant = "primary", size = "md", className = "", children, ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      disabled={loading || props.disabled}
      aria-busy={loading || undefined}
      className={`${buttonClass(variant, size)} ${className}`}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
