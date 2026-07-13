import { BuildSection } from "@/components/build/BuildSection";
import { ItemCard } from "@/components/build/ItemCard";
import type { BuildRecommendation } from "@/types/build";
import type { Champion } from "@/types/champion";
import type { Lane, Playstyle } from "@/types/matchup";

type BuildResultMetadata = {
  source: "cache" | "groq";
  generatedAt: number;
  dataDragonVersion: string;
};

type BuildResultProps = {
  playerChampion: Champion;
  enemyChampion: Champion;
  lane: Lane;
  playstyle: Playstyle;
  recommendation: BuildRecommendation;
  metadata: BuildResultMetadata;
  onEditMatchup: () => void;
};

export function BuildResult({
  playerChampion,
  enemyChampion,
  lane,
  playstyle,
  recommendation,
  metadata,
  onEditMatchup,
}: BuildResultProps) {
  return (
    <section className="mx-auto w-full max-w-6xl space-y-6">
      <ResultHeader
        playerChampion={playerChampion}
        enemyChampion={enemyChampion}
        lane={lane}
        playstyle={playstyle}
        summary={recommendation.summary}
        onEditMatchup={onEditMatchup}
      />

      <EvidenceCard evidence={recommendation.evidence} />

      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-400">
          Data Dragon {metadata.dataDragonVersion}
        </span>
        <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-400">
          {metadata.source === "cache"
            ? "Recent cached explanation"
            : "New AI explanation"}
        </span>
        <span className="rounded-full border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs text-slate-400">
          {formatGeneratedTime(metadata.generatedAt)}
        </span>
      </div>

      <BuildSection
        eyebrow="Lane opening"
        title="Starting items"
        description="Purchase these items before leaving the fountain."
      >
        <div className="grid gap-4 md:grid-cols-2">
          {recommendation.startingItems.map((item, index) => (
            <ItemCard key={`${item.id}-${index}`} item={item} />
          ))}
        </div>
      </BuildSection>

      <BuildSection
        eyebrow="Early game"
        title="First recall"
        description="Choose the option that best matches the current lane state."
      >
        <div className="grid gap-4 lg:grid-cols-2">
          {recommendation.firstRecall.map((recallOption) => (
            <article
              key={recallOption.title}
              className="rounded-2xl border border-slate-800 bg-slate-950/50 p-5"
            >
              <h3 className="text-lg font-bold text-white">
                {recallOption.title}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-400">
                {recallOption.condition}
              </p>
              <div className="mt-5 space-y-3">
                {recallOption.items.map((item) => (
                  <ItemCard key={item.id} item={item} compact />
                ))}
              </div>
            </article>
          ))}
        </div>
      </BuildSection>

      <BuildSection
        eyebrow="Main progression"
        title="Core build"
        description="This is the recommended purchase order for the standard game state."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {recommendation.coreBuild.map((item, index) => (
            <ItemCard
              key={item.id}
              item={item}
              number={index + 1}
            />
          ))}
        </div>
      </BuildSection>

      <BuildSection
        eyebrow="Adaptation"
        title="Situational items"
        description="Do not buy all of these. Choose them only when their condition is present."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          {recommendation.situationalItems.map(({ item, condition }) => (
            <article
              key={item.id}
              className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4"
            >
              <ItemCard item={item} compact />
              <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Buy when
                </p>
                <p className="mt-1 text-sm leading-6 text-slate-300">
                  {condition}
                </p>
              </div>
            </article>
          ))}
        </div>
      </BuildSection>

      <section className="rounded-3xl border border-amber-400/20 bg-amber-400/10 p-5 sm:p-7">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">
          Matchup tip
        </p>
        <p className="mt-3 max-w-3xl text-lg font-semibold leading-8 text-white">
          {recommendation.matchupTip}
        </p>
      </section>

      <p className="px-2 text-center text-xs leading-5 text-slate-600">
        Recommendations are guidance, not guaranteed optimal choices. Adapt to
        the actual game state.
      </p>
    </section>
  );
}

type ResultHeaderProps = {
  playerChampion: Champion;
  enemyChampion: Champion;
  lane: Lane;
  playstyle: Playstyle;
  summary: string;
  onEditMatchup: () => void;
};

function ResultHeader({
  playerChampion,
  enemyChampion,
  lane,
  playstyle,
  summary,
  onEditMatchup,
}: ResultHeaderProps) {
  return (
    <header className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/70 shadow-2xl shadow-black/30">
      <div className="border-b border-slate-800 p-5 sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.25em] text-amber-400">
              Recommended build
            </p>
            <h1 className="mt-2 text-3xl font-black text-white sm:text-4xl">
              {playerChampion.name} vs {enemyChampion.name}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <ResultBadge label={formatLane(lane)} />
              <ResultBadge label={formatPlaystyle(playstyle)} />
            </div>
          </div>

          <button
            type="button"
            onClick={onEditMatchup}
            className="rounded-2xl border border-slate-700 px-5 py-3 font-semibold text-slate-200 transition hover:border-amber-400 hover:text-amber-300"
          >
            Change matchup
          </button>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
        <ChampionHeader label="Your champion" champion={playerChampion} />
        <div className="flex justify-center">
          <span className="grid h-12 w-12 place-items-center rounded-full border border-slate-700 bg-slate-950 font-black text-slate-500">
            VS
          </span>
        </div>
        <ChampionHeader
          label="Opponent"
          champion={enemyChampion}
          alignRight
        />
      </div>

      <div className="border-t border-slate-800 bg-slate-950/40 p-5 sm:p-7">
        <p className="max-w-4xl leading-7 text-slate-300">{summary}</p>
      </div>
    </header>
  );
}

type ChampionHeaderProps = {
  label: string;
  champion: Champion;
  alignRight?: boolean;
};

function ChampionHeader({
  label,
  champion,
  alignRight = false,
}: ChampionHeaderProps) {
  return (
    <div
      className={`flex items-center gap-4 ${
        alignRight ? "lg:flex-row-reverse lg:text-right" : ""
      }`}
    >
      <img
        src={champion.imageUrl}
        alt={`${champion.name} portrait`}
        className="h-20 w-20 rounded-2xl object-cover"
      />
      <div>
        <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-xl font-black text-white">{champion.name}</p>
        <p className="text-sm capitalize text-slate-500">{champion.title}</p>
      </div>
    </div>
  );
}

function ResultBadge({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-sm font-medium text-slate-300">
      {label}
    </span>
  );
}

function EvidenceCard({
  evidence,
}: {
  evidence: BuildRecommendation["evidence"];
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-400">
            Recommendation evidence
          </p>
          <p className="mt-2 font-semibold text-white">
            {formatEvidenceLevel(evidence.level)}
          </p>
          <p className="mt-1 text-sm text-slate-400">
            {formatEvidenceDescription(evidence)}
          </p>
        </div>

        <span
          className={`w-fit rounded-full border px-3 py-1.5 text-xs font-bold ${getConfidenceClasses(
            evidence.confidence,
          )}`}
        >
          {evidence.confidence} confidence
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <EvidenceMetric
          label="Evidence sample"
          value={`${evidence.sampleSize.toLocaleString("en-US")} games`}
        />
        <EvidenceMetric
          label="Starting build"
          value={`${evidence.startingBuildGames.toLocaleString("en-US")} games`}
        />
        <EvidenceMetric
          label="Core sequence"
          value={`${evidence.coreBuildGames.toLocaleString("en-US")} games`}
        />
      </div>
    </section>
  );
}

function EvidenceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 font-bold text-white">{value}</p>
    </div>
  );
}

function formatLane(lane: Lane): string {
  const labels: Record<Lane, string> = {
    TOP: "Top lane",
    JUNGLE: "Jungle",
    MID: "Mid lane",
    ADC: "ADC",
    SUPPORT: "Support",
  };

  return labels[lane];
}

function formatPlaystyle(playstyle: Playstyle): string {
  const labels: Record<Playstyle, string> = {
    SAFE: "Safe playstyle",
    BALANCED: "Balanced playstyle",
    AGGRESSIVE: "Aggressive playstyle",
  };

  return labels[playstyle];
}

function formatGeneratedTime(timestamp: number): string {
  const generatedDate = new Date(timestamp);

  return `Generated ${generatedDate.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  })} UTC`;
}

function formatEvidenceLevel(
  level: BuildRecommendation["evidence"]["level"],
): string {
  const labels: Record<typeof level, string> = {
    EXACT_MATCHUP_RANKED: "Exact matchup · Emerald+",
    EXACT_MATCHUP_ALL_RANKS: "Exact matchup · all collected ranks",
    CHAMPION_LANE_RANKED: "Champion and lane · Emerald+",
    CHAMPION_LANE_ALL_RANKS: "Champion and lane · all collected ranks",
    AI_FALLBACK: "AI fallback",
  };

  return labels[level];
}

function formatEvidenceDescription(
  evidence: BuildRecommendation["evidence"],
): string {
  if (evidence.level === "EXACT_MATCHUP_RANKED") {
    return "The item sequences were selected from recent exact-matchup statistics.";
  }

  if (evidence.level === "EXACT_MATCHUP_ALL_RANKS") {
    return "The exact matchup lacked enough preferred-rank data, so all collected ranks were used.";
  }

  if (
    evidence.level === "CHAMPION_LANE_RANKED" ||
    evidence.level === "CHAMPION_LANE_ALL_RANKS"
  ) {
    return "Exact matchup evidence was insufficient. Broader champion-and-lane statistics were used.";
  }

  return "No sufficient statistical evidence was available. Treat this result as low-confidence guidance.";
}

function getConfidenceClasses(
  confidence: BuildRecommendation["evidence"]["confidence"],
): string {
  switch (confidence) {
    case "HIGH":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
    case "MEDIUM":
      return "border-amber-500/30 bg-amber-500/10 text-amber-300";
    case "LOW":
      return "border-red-500/30 bg-red-500/10 text-red-300";
  }
}
