export function SectionHeader({ label }: { label: string }) {
  return (
    <div className="mb-2 flex items-center gap-3">
      <p className="shrink-0 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        {label}
      </p>
      <div className="h-px flex-1 bg-slate-800" />
    </div>
  );
}
