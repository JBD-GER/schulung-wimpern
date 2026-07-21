import {
  forwardRef,
  type InputHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { cn } from "@/lib/utils";

type FieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  error?: string;
  hint?: string;
};

export const Field = forwardRef<HTMLInputElement, FieldProps>(
  ({ id, label, error, hint, className, ...props }, ref) => {
    const fieldId = id ?? props.name;
    const descriptionId = error
      ? `${fieldId}-error`
      : hint
        ? `${fieldId}-hint`
        : undefined;

    return (
      <div className="space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-bold text-navy">
          {label}
          {props.required && (
            <span className="ml-1 text-danger" aria-hidden="true">
              *
            </span>
          )}
        </label>
        <input
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error)}
          aria-describedby={descriptionId}
          className={cn(
            "min-h-12 w-full rounded-xl border bg-white px-4 py-3 text-base text-ink shadow-sm transition placeholder:text-muted/65 hover:border-navy/35 focus:border-gold focus:outline-none",
            error ? "border-danger" : "border-line",
            className,
          )}
          {...props}
        />
        {error ? (
          <p id={descriptionId} className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : hint ? (
          <p id={descriptionId} className="text-xs leading-5 text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    );
  },
);
Field.displayName = "Field";

type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  error?: string;
  children: React.ReactNode;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ id, label, error, className, children, ...props }, ref) => {
    const fieldId = id ?? props.name;
    return (
      <div className="space-y-2">
        <label htmlFor={fieldId} className="block text-sm font-bold text-navy">
          {label}
        </label>
        <select
          ref={ref}
          id={fieldId}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${fieldId}-error` : undefined}
          className={cn(
            "min-h-12 w-full rounded-xl border border-line bg-white px-4 py-3 text-base text-ink shadow-sm hover:border-navy/35 focus:border-gold focus:outline-none",
            error && "border-danger",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        {error && (
          <p
            id={`${fieldId}-error`}
            className="text-sm text-danger"
            role="alert"
          >
            {error}
          </p>
        )}
      </div>
    );
  },
);
SelectField.displayName = "SelectField";

export function Checkbox({
  id,
  label,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: React.ReactNode;
  error?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-white p-4 text-sm leading-6 text-ink transition hover:border-gold/60"
      >
        <input
          id={id}
          type="checkbox"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-1 size-5 shrink-0 accent-navy"
          {...props}
        />
        <span>{label}</span>
      </label>
      {error && (
        <p id={`${id}-error`} className="mt-2 text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
