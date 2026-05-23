import type { HTMLAttributes, ReactNode } from "react";

interface ContainerProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  size?: "default" | "narrow" | "wide";
}

const sizeClasses: Record<NonNullable<ContainerProps["size"]>, string> = {
  narrow: "max-w-3xl",
  default: "max-w-6xl",
  wide: "max-w-7xl",
};

export function Container({
  children,
  size = "default",
  className = "",
  ...rest
}: ContainerProps) {
  return (
    <div
      className={`mx-auto w-full px-5 sm:px-6 lg:px-8 ${sizeClasses[size]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
