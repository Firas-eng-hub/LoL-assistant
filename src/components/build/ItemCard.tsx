import type { BuildItem } from "@/types/build";

type ItemCardProps = {
  item: BuildItem;
  number?: number;
  compact?: boolean;
};

export function ItemCard({
  item,
  number,
  compact = false,
}: ItemCardProps) {
  return (
    <article
      className={`flex gap-4 rounded-2xl border border-slate-800 bg-slate-950/60 ${
        compact ? "p-3" : "p-4"
      }`}
    >
      <div className="relative shrink-0">
        <img
          src={item.imageUrl}
          alt={`${item.name} icon`}
          className={`rounded-xl object-cover ${
            compact ? "h-12 w-12" : "h-16 w-16"
          }`}
        />

        {number !== undefined && (
          <span className="absolute -left-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-amber-400 text-xs font-black text-slate-950">
            {number}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <h3 className="font-bold text-white">{item.name}</h3>
        <p className="mt-1 text-sm leading-6 text-slate-400">{item.reason}</p>
      </div>
    </article>
  );
}
