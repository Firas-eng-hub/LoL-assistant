import type { ReactNode } from "react";

type BuildSectionProps = {
  eyebrow: string;
  title: string;
  description?: string;
  children: ReactNode;
};

export function BuildSection({
  eyebrow,
  title,
  description,
  children,
}: BuildSectionProps) {
  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900/60 p-5 sm:p-7">
      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
          {eyebrow}
        </p>
        <h2 className="mt-2 text-2xl font-black text-white">{title}</h2>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
            {description}
          </p>
        )}
      </header>

      {children}
    </section>
  );
}
