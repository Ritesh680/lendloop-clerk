import clsx from "clsx";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const VARIANTS: Record<Variant, string> = {
  primary: "border-brass bg-brass text-ink hover:bg-manila-soft hover:border-manila-soft",
  secondary: "border-zinc-line text-chalk hover:border-steel hover:bg-enamel-800",
  ghost: "border-transparent text-steel hover:text-chalk hover:bg-enamel-800",
  danger: "border-stamp/70 text-stamp hover:bg-stamp hover:text-ink hover:border-stamp",
};

export const buttonClasses = (variant: Variant = "secondary", extra?: string) =>
  clsx(
    "inline-flex min-h-9 cursor-pointer items-center justify-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    VARIANTS[variant],
    extra,
  );

export function Button({
  variant,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, className)}
      {...props}
    />
  );
}
