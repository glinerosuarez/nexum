import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { ArrowUpRight } from "lucide-react";

type Variant = "primary" | "secondary" | "ghost";
type Size = "sm" | "md" | "lg";

interface BaseProps {
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  withArrow?: boolean;
  className?: string;
}

interface ButtonProps
  extends BaseProps,
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "className"> {
  href?: undefined;
}

interface LinkProps
  extends BaseProps,
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children" | "className"> {
  href: string;
}

type Props = ButtonProps | LinkProps;

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-canvas hover:bg-[#1a1a1c] active:bg-[#000] shadow-soft",
  secondary:
    "bg-canvas-raised text-ink border border-line hover:border-ink/40 hover:bg-white",
  ghost:
    "bg-transparent text-ink hover:bg-ink/5 border border-transparent hover:border-line",
};

const sizes: Record<Size, string> = {
  sm: "h-9 px-3.5 text-sm gap-1.5",
  md: "h-11 px-5 text-[15px] gap-2",
  lg: "h-12 px-6 text-[15px] gap-2",
};

export function Button(props: Props) {
  const {
    children,
    variant = "primary",
    size = "md",
    withArrow = false,
    className = "",
  } = props;

  const cls = `inline-flex items-center justify-center rounded-full font-medium tracking-tight transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none ${variants[variant]} ${sizes[size]} ${className}`;

  const content = (
    <>
      <span>{children}</span>
      {withArrow ? (
        <ArrowUpRight className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
      ) : null}
    </>
  );

  if ("href" in props && props.href) {
    const { href, ...rest } = props as LinkProps;
    return (
      <a href={href} className={cls} {...rest}>
        {content}
      </a>
    );
  }

  const { ...rest } = props as ButtonProps;
  return (
    <button type="button" className={cls} {...rest}>
      {content}
    </button>
  );
}
