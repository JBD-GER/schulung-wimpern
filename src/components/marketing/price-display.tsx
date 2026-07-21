import { formatPrice } from "@/lib/utils";

export type PublicProductView = {
  name: string;
  unitAmount: number | null;
  currency: string;
  taxBehavior: string | null;
  available: boolean;
};

function taxLabel(taxBehavior: string | null) {
  if (taxBehavior === "inclusive") return "inkl. der geltenden Umsatzsteuer";
  if (taxBehavior === "exclusive") return "zzgl. der geltenden Umsatzsteuer";
  return "Steuerdarstellung im sicheren Checkout";
}

export function PriceDisplay({
  product,
  inverse = false,
}: {
  product: PublicProductView;
  inverse?: boolean;
}) {
  const amount = product.unitAmount;
  const hasPublicPrice = product.available && amount !== null;

  if (!hasPublicPrice) {
    return (
      <div>
        <p
          className={
            inverse ? "font-semibold text-white" : "font-semibold text-navy"
          }
        >
          Preis wird im sicheren Checkout angezeigt
        </p>
        <p
          className={
            inverse ? "mt-1 text-sm text-white/65" : "mt-1 text-sm text-muted"
          }
        >
          Einmalzahlung · kein Abonnement
        </p>
      </div>
    );
  }

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
          {formatPrice(amount, product.currency)}
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
        {taxLabel(product.taxBehavior)}
      </p>
    </div>
  );
}
