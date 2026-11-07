import type { PropsWithChildren, ReactNode } from "react";
interface SectionCardProps {
  title: string;
  description?: string;
  action?: ReactNode;
}
export function SectionCard({
  action,
  children,
  description,
  title,
}: PropsWithChildren<SectionCardProps>) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <header className="mb-7 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-title font-semibold tracking-tight">{title}</h2>
          {description && (
            <p className="mt-2 max-w-lg text-body leading-relaxed text-muted">
              {description}
            </p>
          )}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
