import { COURSE_OFFER } from "@/data/offer";

export type PublicProductView = {
  name: string;
  unitAmount: number | null;
  currency: string;
  taxBehavior: string | null;
  available: boolean;
};

function formatPublicPrice(amount: number, currency: string) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: currency.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}

function taxLabel(taxBehavior: string | null) {
  if (taxBehavior === "inclusive") return "inkl. MwSt.";
  if (taxBehavior === "exclusive") return "zzgl. MwSt.";
  return "Steuerdarstellung im sicheren Checkout";
}

export function PriceDisplay({
  product,
  inverse = false,
}: {
  product: PublicProductView;
  inverse?: boolean;
}) {
  const amount = product.unitAmount ?? COURSE_OFFER.unitAmount;
  const currency =
    product.unitAmount !== null ? product.currency : COURSE_OFFER.currency;
  const taxBehavior =
    product.unitAmount === null
      ? COURSE_OFFER.taxBehavior
      : product.taxBehavior;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <p
          className={
            inverse
              ? "font-serif text-4xl font-semibold tracking-tight text-white"
              : "font-serif text-4xl font-semibold tracking-tight text-navy"
          }
        >
          {formatPublicPrice(amount, currency)}
        </p>
        <p
          className={
            inverse
              ? "pb-1 text-sm font-bold text-white/70"
              : "pb-1 text-sm font-bold text-muted"
          }
        >
          einmalig
        </p>
      </div>
      <p
        className={
          inverse ? "mt-1 text-xs text-white/60" : "mt-1 text-xs text-muted"
        }
      >
        {taxLabel(taxBehavior)}
      </p>
    </div>
  );
}
