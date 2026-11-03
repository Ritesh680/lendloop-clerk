import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

const CONTROL =
  "w-full rounded-md border border-zinc-line bg-enamel-950 px-3 py-2 text-sm text-chalk placeholder:text-steel/60 focus:border-brass focus:outline-none";

function Label({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="flex items-baseline justify-between gap-2 font-medium">
        {label}
        {hint && (
          <span className="font-mono text-[11px] font-normal text-steel tabular-nums">
            {hint}
          </span>
        )}
      </span>
      {children}
    </label>
  );
}

export function TextField({
  label,
  hint,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <Label label={label} hint={hint}>
      <input className={CONTROL} {...props} />
    </Label>
  );
}

export function TextArea({
  label,
  hint,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
}) {
  return (
    <Label label={label} hint={hint}>
      <textarea className={CONTROL} rows={3} {...props} />
    </Label>
  );
}

export function SelectField({
  label,
  options,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  options: readonly { value: string; label: string }[];
}) {
  return (
    <Label label={label}>
      <select className={CONTROL} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Label>
  );
}
