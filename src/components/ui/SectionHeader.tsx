import type { ReactNode } from "react";

type Props = {
  label: string;
  action?: ReactNode;
};

export function SectionHeader({ label, action }: Props) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-faint)]">
        {label}
      </p>
      <div className="h-px flex-1 bg-[var(--border-default)]" />
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
