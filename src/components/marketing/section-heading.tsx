import { cn } from "@/lib/utils";

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "max-w-3xl",
        align === "center" && "mx-auto text-center",
        className,
      )}
    >
      {eyebrow ? (
        <p className="mb-4 text-xs font-extrabold tracking-[0.18em] text-gold uppercase sm:text-sm">
          {eyebrow}
        </p>
      ) : null}
      <h2 className="hyphens-auto font-serif text-3xl leading-[1.12] font-semibold tracking-[-0.035em] text-navy sm:text-4xl lg:text-5xl">
        {title}
      </h2>
      {description ? (
        <p className="mt-5 text-base leading-7 text-muted sm:text-lg sm:leading-8">
          {description}
        </p>
      ) : null}
    </div>
  );
}
