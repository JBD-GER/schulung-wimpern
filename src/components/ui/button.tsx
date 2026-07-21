import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-navy text-white shadow-[0_8px_24px_rgba(29,39,51,.16)] hover:bg-navy-soft",
  secondary: "border border-navy bg-white text-navy hover:bg-ivory",
  gold: "bg-gold text-navy hover:bg-[#c09b61]",
  ghost: "text-navy hover:bg-navy/5",
  danger: "bg-danger text-white hover:bg-[#8b3030]",
} as const;

const sizes = {
  sm: "min-h-10 px-4 py-2 text-sm",
  md: "min-h-12 px-5 py-3 text-sm",
  lg: "min-h-14 px-7 py-3.5 text-base",
} as const;

export function buttonStyles({
  variant = "primary",
  size = "md",
  className,
}: {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  className?: string;
} = {}) {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-xl font-bold tracking-[-0.01em] transition-colors disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    sizes[size],
    className,
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonStyles({ variant, size, className })}
      {...props}
    />
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
};

export function ButtonLink({
  className,
  variant,
  size,
  ...props
}: ButtonLinkProps) {
  return (
    <Link className={buttonStyles({ variant, size, className })} {...props} />
  );
}
