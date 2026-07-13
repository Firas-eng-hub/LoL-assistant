import type { Champion } from "@/types/champion";
import type { Lane, Playstyle } from "@/types/matchup";

type MatchupReviewProps = {
  playerChampion: Champion;
  enemyChampion: Champion;
  lane: Lane;
  playstyle: Playstyle;
};

export function MatchupReview({
  playerChampion,
  enemyChampion,
  lane,
  playstyle,
}: MatchupReviewProps) {
  return (
    <section className="rounded-3xl border border-slate-700 bg-slate-950/70 p-5">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-amber-400">
            Matchup review
          </p>
          <h2 className="mt-1 text-xl font-bold text-white">
            Check your selections
          </h2>
        </div>

        <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
          Ready
        </span>
      </div>

      <div className="grid items-center gap-5 sm:grid-cols-[1fr_auto_1fr]">
        <ChampionReview title="You" champion={playerChampion} />

        <div className="flex justify-center">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-slate-700 bg-slate-900 text-sm font-black text-slate-500">
            VS
          </span>
        </div>

        <ChampionReview
          title="Opponent"
          champion={enemyChampion}
          alignRight
        />
      </div>

      <div className="mt-6 grid gap-3 border-t border-slate-800 pt-5 sm:grid-cols-2">
        <ReviewValue label="Lane" value={formatLane(lane)} />
        <ReviewValue
          label="Playstyle"
          value={formatPlaystyle(playstyle)}
        />
      </div>
    </section>
  );
}

type ChampionReviewProps = {
  title: string;
  champion: Champion;
  alignRight?: boolean;
};

function ChampionReview({
  title,
  champion,
  alignRight = false,
}: ChampionReviewProps) {
  return (
    <div
      className={`flex items-center gap-4 ${
        alignRight ? "sm:flex-row-reverse sm:text-right" : ""
      }`}
    >
      <img
        src={champion.imageUrl}
        alt={`${champion.name} portrait`}
        className="h-16 w-16 rounded-xl object-cover"
      />

      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </p>
        <p className="truncate text-lg font-bold text-white">{champion.name}</p>
        <p className="truncate text-sm capitalize text-slate-500">
          {champion.title}
        </p>
      </div>
    </div>
  );
}

type ReviewValueProps = {
  label: string;
  value: string;
};

function ReviewValue({ label, value }: ReviewValueProps) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 font-bold text-white">{value}</p>
    </div>
  );
}

function formatLane(lane: Lane): string {
  const labels: Record<Lane, string> = {
    TOP: "Top",
    JUNGLE: "Jungle",
    MID: "Mid",
    ADC: "ADC",
    SUPPORT: "Support",
  };

  return labels[lane];
}

function formatPlaystyle(playstyle: Playstyle): string {
  const labels: Record<Playstyle, string> = {
    SAFE: "Safe",
    BALANCED: "Balanced",
    AGGRESSIVE: "Aggressive",
  };

  return labels[playstyle];
}
