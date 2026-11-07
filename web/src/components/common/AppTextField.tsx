import type { InputHTMLAttributes } from "react";
interface AppTextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
}
export function AppTextField({ label, ...props }: AppTextFieldProps) {
  return (
    <label className="grid gap-2 text-caption font-semibold text-muted">
      <span>{label}</span>
      <input
        className="min-h-12 w-full rounded-xl border border-line bg-surface px-4 text-body text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent-soft disabled:bg-canvas"
        {...props}
      />
    </label>
  );
}
