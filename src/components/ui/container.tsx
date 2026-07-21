import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Container({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[1200px] px-5 sm:px-7 lg:px-10",
        className,
      )}
      {...props}
    />
  );
}
