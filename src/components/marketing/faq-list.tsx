import { Plus } from "lucide-react";

export type FaqItem = {
  question: string;
  answer: string;
};

export function FaqList({ items }: { items: readonly FaqItem[] }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start">
      {items.map((item) => (
        <details
          key={item.question}
          className="group rounded-2xl border border-line bg-white shadow-[0_8px_30px_rgba(29,39,51,0.035)] open:border-gold/40"
        >
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 px-5 py-4 font-bold text-navy marker:content-none [&::-webkit-details-marker]:hidden sm:px-6">
            <span>{item.question}</span>
            <span
              className="grid size-8 shrink-0 place-items-center rounded-full bg-ivory text-gold transition-transform group-open:rotate-45"
              aria-hidden="true"
            >
              <Plus className="size-4" strokeWidth={2} />
            </span>
          </summary>
          <div className="border-t border-line/80 px-5 py-5 text-sm leading-7 text-muted sm:px-6 sm:text-base">
            <p>{item.answer}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
