export type Playstyle = "SAFE" | "BALANCED" | "AGGRESSIVE";

export type StatisticalBuildRecord = {
  patch: string;
  startingItemIds: string[];
  firstRecallItemIds: string[];
  coreItemIds: string[];
  games: number;
  wins: number;
  updatedAt: number;
};

export type ScoringItem = {
  tags?: string[];
  gold?: { total?: number };
};

export type BuildCandidate = {
  items: string[];
  games: number;
  winRate: number;
  score: number;
};

export type RankedCandidates = {
  startingBuilds: BuildCandidate[];
  firstRecallBuilds: BuildCandidate[];
  coreBuilds: BuildCandidate[];
};

const CONFIDENCE_WEIGHT = 100;

const playstyleWeights: Record<
  Playstyle,
  {
    matchupScore: number;
    survivalScore: number;
    damageScore: number;
    popularityScore: number;
  }
> = {
  SAFE: {
    matchupScore: 0.45,
    survivalScore: 0.35,
    damageScore: 0.1,
    popularityScore: 0.1,
  },
  BALANCED: {
    matchupScore: 0.55,
    survivalScore: 0.15,
    damageScore: 0.15,
    popularityScore: 0.15,
  },
  AGGRESSIVE: {
    matchupScore: 0.4,
    survivalScore: 0.05,
    damageScore: 0.4,
    popularityScore: 0.15,
  },
};

export function createRankedCandidates(input: {
  records: StatisticalBuildRecord[];
  items: Record<string, ScoringItem>;
  playstyle: Playstyle;
  currentPatch: string;
  firstRecallGold: number;
}): RankedCandidates {
  return {
    startingBuilds: rankSection(
      input.records,
      (record) => record.startingItemIds,
      input,
    ),
    firstRecallBuilds: rankSection(
      input.records,
      (record) => record.firstRecallItemIds,
      input,
    ).filter((candidate) =>
      canAfford(candidate.items, input.firstRecallGold, input.items),
    ),
    coreBuilds: rankSection(
      input.records,
      (record) => record.coreItemIds,
      input,
    ),
  };
}

export function scoreBuild(input: {
  wins: number;
  games: number;
  averageWinRate: number;
  confidenceWeight?: number;
}): number {
  const weight = input.confidenceWeight ?? CONFIDENCE_WEIGHT;

  return (
    (input.wins + weight * input.averageWinRate) /
    (input.games + weight)
  );
}

export function canAfford(
  itemIds: string[],
  availableGold: number,
  items: Record<string, ScoringItem>,
): boolean {
  const totalCost = itemIds.reduce(
    (sum, itemId) => sum + (items[itemId]?.gold?.total ?? Infinity),
    0,
  );

  return totalCost <= availableGold;
}

function rankSection(
  records: StatisticalBuildRecord[],
  selectItems: (record: StatisticalBuildRecord) => string[],
  input: {
    items: Record<string, ScoringItem>;
    playstyle: Playstyle;
    currentPatch: string;
  },
): BuildCandidate[] {
  const aggregates = new Map<
    string,
    { items: string[]; games: number; wins: number; recencyTotal: number }
  >();

  for (const record of records) {
    const itemIds = selectItems(record);

    if (itemIds.length === 0 || itemIds.some((id) => !input.items[id])) {
      continue;
    }

    const key = itemIds.join(">");
    const existing = aggregates.get(key) ?? {
      items: itemIds,
      games: 0,
      wins: 0,
      recencyTotal: 0,
    };
    existing.games += record.games;
    existing.wins += record.wins;
    existing.recencyTotal +=
      record.games * (record.patch === input.currentPatch ? 1 : 0.75);
    aggregates.set(key, existing);
  }

  const totalGames = [...aggregates.values()].reduce(
    (sum, aggregate) => sum + aggregate.games,
    0,
  );
  const totalWins = [...aggregates.values()].reduce(
    (sum, aggregate) => sum + aggregate.wins,
    0,
  );
  const averageWinRate = totalGames > 0 ? totalWins / totalGames : 0.5;

  return [...aggregates.values()]
    .map((aggregate) => {
      const winRate = aggregate.wins / aggregate.games;
      const smoothedWinRate = scoreBuild({
        wins: aggregate.wins,
        games: aggregate.games,
        averageWinRate,
      });
      const pickRateScore = aggregate.games / totalGames;
      const sampleConfidence =
        aggregate.games / (aggregate.games + CONFIDENCE_WEIGHT);
      const patchRecency = aggregate.recencyTotal / aggregate.games;
      const statisticalScore =
        0.5 * smoothedWinRate +
        0.2 * pickRateScore +
        0.15 * sampleConfidence +
        0.15 * patchRecency;
      const characteristics = getItemCharacteristics(
        aggregate.items,
        input.items,
      );
      const weights = playstyleWeights[input.playstyle];
      const finalScore =
        weights.matchupScore * statisticalScore +
        weights.survivalScore * characteristics.survival +
        weights.damageScore * characteristics.damage +
        weights.popularityScore * pickRateScore;

      return {
        items: aggregate.items,
        games: aggregate.games,
        winRate: round(winRate),
        score: round(finalScore),
      };
    })
    .sort((first, second) => second.score - first.score)
    .slice(0, 3);
}

function getItemCharacteristics(
  itemIds: string[],
  items: Record<string, ScoringItem>,
): { survival: number; damage: number } {
  const survivalTags = new Set([
    "Health",
    "Armor",
    "SpellBlock",
    "Tenacity",
    "HealthRegen",
    "LifeSteal",
  ]);
  const damageTags = new Set([
    "Damage",
    "SpellDamage",
    "AttackSpeed",
    "CriticalStrike",
    "MagicPenetration",
    "ArmorPenetration",
    "OnHit",
  ]);
  let survivalMatches = 0;
  let damageMatches = 0;

  for (const itemId of itemIds) {
    const tags = items[itemId]?.tags ?? [];

    if (tags.some((tag) => survivalTags.has(tag))) {
      survivalMatches += 1;
    }

    if (tags.some((tag) => damageTags.has(tag))) {
      damageMatches += 1;
    }
  }

  const denominator = Math.max(1, itemIds.length);

  return {
    survival: survivalMatches / denominator,
    damage: damageMatches / denominator,
  };
}

function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
