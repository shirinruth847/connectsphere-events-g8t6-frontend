import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "neutral"
  | "destructive"
  | "ghost";
export type ButtonSize = "sm" | "md";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-primary text-on-primary shadow-elevation-1 hover:bg-primary-container",
  secondary: "bg-surface-container text-on-surface hover:bg-surface-container-high",
  tertiary: "bg-tertiary text-on-tertiary shadow-elevation-1 hover:bg-tertiary-container",
  neutral: "bg-on-surface-variant text-white hover:bg-on-surface",
  destructive: "bg-error text-on-error shadow-elevation-1 hover:bg-on-error-container",
  ghost: "text-on-surface-variant hover:bg-surface-container-low",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 gap-1.5 rounded-chip px-3 text-body-sm",
  md: "h-10 gap-2 rounded-control px-4 text-body",
};

/** Shared by <Button> and by links that should look like buttons. */
export function buttonClasses({
  variant = "primary",
  size = "md",
  className,
}: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}) {
  return cn(
    "inline-flex shrink-0 items-center justify-center font-semibold whitespace-nowrap transition-colors duration-150 ease-out pointer-coarse:min-h-11",
    "disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none",
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

interface ButtonProps extends ComponentProps<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function Button({
  variant,
  size,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses({ variant, size, className })}
      {...props}
    />
  );
}
