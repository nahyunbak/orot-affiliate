import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: "primary" | "quiet" | "danger";
  size?: "default" | "compact";
}
const tones = {
  primary: "bg-accent text-surface hover:opacity-90",
  quiet: "border border-line bg-surface text-ink hover:bg-canvas",
  danger: "bg-danger text-surface hover:opacity-90",
};
export function AppButton({
  children,
  className = "",
  tone = "primary",
  type = "button",
  size = "default",
  ...props
}: PropsWithChildren<AppButtonProps>) {
  return (
    <button
      type={type}
      className={`flex items-center justify-center gap-2 ${size === "compact" ? "min-h-10 rounded-md px-3 py-2 text-caption [&_svg]:size-4" : "min-h-12 rounded-xl px-5 py-3 text-body"} font-semibold transition-opacity focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${tones[tone]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
