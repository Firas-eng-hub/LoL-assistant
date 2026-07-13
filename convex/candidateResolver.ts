import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "./_generated/server";
import type {
  CandidateResolution,
  EvidenceConfidence,
  EvidenceLevel,
  StatisticalBuildType,
  StatisticalCandidate,
} from "./lib/recommendationCandidates";

const laneValidator = v.union(
  v.literal("TOP"),
  v.literal("JUNGLE"),
  v.literal("MID"),
  v.literal("ADC"),
  v.literal("SUPPORT"),
);

const buildTypeValidator = v.union(
  v.literal("STARTING"),
  v.literal("CORE"),
);

type Lane = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";
type ScopedCandidate = StatisticalCandidate & { scopeKey: string };

const MINIMUM_EXACT_SAMPLE_SIZE = 30;
const MINIMUM_CHAMPION_LANE_SAMPLE_SIZE = 50;
const MINIMUM_CANDIDATE_GAMES = 5;
const DEFAULT_CANDIDATE_LIMIT = 3;

const candidateValidator = v.object({
  orderedItemIds: v.array(v.string()),
  games: v.number(),
  wins: v.number(),
  scopeTotalGames: v.number(),
  rawWinRate: v.number(),
  smoothedWinRate: v.number(),
  pickRate: v.number(),
  confidenceScore: v.number(),
  finalScore: v.number(),
});

const resolutionValidator = v.object({
  evidenceLevel: v.union(
    v.literal("EXACT_MATCHUP_RANKED"),
    v.literal("EXACT_MATCHUP_ALL_RANKS"),
    v.literal("CHAMPION_LANE_RANKED"),
    v.literal("CHAMPION_LANE_ALL_RANKS"),
    v.literal("NO_STATISTICAL_DATA"),
  ),
  confidence: v.union(
    v.literal("LOW"),
    v.literal("MEDIUM"),
    v.literal("HIGH"),
  ),
  sampleSize: v.number(),
  candidateCount: v.number(),
  candidates: v.array(candidateValidator),
});

export const resolveCandidates = internalQuery({
  args: {
    patch: v.string(),
    championId: v.string(),
    opponentChampionId: v.string(),
    lane: laneValidator,
    preferredTierGroup: v.string(),
    buildType: buildTypeValidator,
    limit: v.optional(v.number()),
  },
  returns: resolutionValidator,
  handler: async (ctx, args): Promise<CandidateResolution> => {
    assertResolverInput(args);
    return resolveCandidateLevel(ctx, {
      ...args,
      limit: normalizeLimit(args.limit),
    });
  },
});

export const resolveRecommendationEvidence = internalQuery({
  args: {
    patch: v.string(),
    championId: v.string(),
    opponentChampionId: v.string(),
    lane: laneValidator,
    preferredTierGroup: v.string(),
  },
  returns: v.object({
    starting: resolutionValidator,
    core: resolutionValidator,
  }),
  handler: async (ctx, args): Promise<{
    starting: CandidateResolution;
    core: CandidateResolution;
  }> => {
    assertResolverInput(args);
    const starting = await resolveCandidateLevel(ctx, {
      ...args,
      buildType: "STARTING",
      limit: DEFAULT_CANDIDATE_LIMIT,
    });
    const core = await resolveCandidateLevel(ctx, {
      ...args,
      buildType: "CORE",
      limit: DEFAULT_CANDIDATE_LIMIT,
    });

    return { starting, core };
  },
});

type ResolveCandidateInput = {
  patch: string;
  championId: string;
  opponentChampionId: string;
  lane: Lane;
  preferredTierGroup: string;
  buildType: StatisticalBuildType;
  limit: number;
};

async function resolveCandidateLevel(
  ctx: QueryCtx,
  args: ResolveCandidateInput,
): Promise<CandidateResolution> {
  const levels: Array<{
    evidenceLevel: EvidenceLevel;
    minimumSamples: number;
    load: () => Promise<ScopedCandidate[]>;
  }> = [
    {
      evidenceLevel: "EXACT_MATCHUP_RANKED",
      minimumSamples: MINIMUM_EXACT_SAMPLE_SIZE,
      load: () => loadExactTierCandidates(ctx, {
        patch: args.patch,
        championId: args.championId,
        opponentChampionId: args.opponentChampionId,
        lane: args.lane,
        tierGroup: args.preferredTierGroup,
        buildType: args.buildType,
      }),
    },
    {
      evidenceLevel: "EXACT_MATCHUP_ALL_RANKS",
      minimumSamples: MINIMUM_EXACT_SAMPLE_SIZE,
      load: () => loadExactAllTierCandidates(ctx, {
        patch: args.patch,
        championId: args.championId,
        opponentChampionId: args.opponentChampionId,
        lane: args.lane,
        buildType: args.buildType,
      }),
    },
    {
      evidenceLevel: "CHAMPION_LANE_RANKED",
      minimumSamples: MINIMUM_CHAMPION_LANE_SAMPLE_SIZE,
      load: () => loadChampionLaneTierCandidates(ctx, {
        patch: args.patch,
        championId: args.championId,
        lane: args.lane,
        tierGroup: args.preferredTierGroup,
        buildType: args.buildType,
      }),
    },
    {
      evidenceLevel: "CHAMPION_LANE_ALL_RANKS",
      minimumSamples: MINIMUM_CHAMPION_LANE_SAMPLE_SIZE,
      load: () => loadChampionLaneAllTierCandidates(ctx, {
        patch: args.patch,
        championId: args.championId,
        lane: args.lane,
        buildType: args.buildType,
      }),
    },
  ];

  for (const level of levels) {
    const combinedCandidates = combineIdenticalBuilds(await level.load());
    const sampleSize = calculateTotalSampleSize(combinedCandidates);
    const usableCandidates = combinedCandidates
      .filter((candidate) => candidate.games >= MINIMUM_CANDIDATE_GAMES)
      .sort((first, second) => second.finalScore - first.finalScore);

    if (sampleSize >= level.minimumSamples && usableCandidates.length > 0) {
      const candidates = usableCandidates.slice(0, args.limit);

      return {
        evidenceLevel: level.evidenceLevel,
        confidence: determineConfidence({
          evidenceLevel: level.evidenceLevel,
          sampleSize,
        }),
        sampleSize,
        candidateCount: candidates.length,
        candidates,
      };
    }
  }

  return {
    evidenceLevel: "NO_STATISTICAL_DATA",
    confidence: "LOW",
    sampleSize: 0,
    candidateCount: 0,
    candidates: [],
  };
}

function normalizeLimit(limit: number | undefined): number {
  return Math.min(
    Math.max(Math.floor(limit ?? DEFAULT_CANDIDATE_LIMIT), 1),
    10,
  );
}

type ExactTierInput = {
  patch: string;
  championId: string;
  opponentChampionId: string;
  lane: Lane;
  tierGroup: string;
  buildType: StatisticalBuildType;
};

async function loadExactTierCandidates(
  ctx: QueryCtx,
  input: ExactTierInput,
): Promise<ScopedCandidate[]> {
  const documents = await ctx.db
    .query("matchupBuildStats")
    .withIndex("by_exact_matchup", (query) =>
      query
        .eq("patch", input.patch)
        .eq("championId", input.championId)
        .eq("opponentChampionId", input.opponentChampionId)
        .eq("lane", input.lane)
        .eq("tierGroup", input.tierGroup)
        .eq("buildType", input.buildType),
    )
    .collect();

  return documents.map(toScopedCandidate);
}

type ExactAllTierInput = Omit<ExactTierInput, "tierGroup">;

async function loadExactAllTierCandidates(
  ctx: QueryCtx,
  input: ExactAllTierInput,
): Promise<ScopedCandidate[]> {
  const documents = await ctx.db
    .query("matchupBuildStats")
    .withIndex("by_exact_matchup_all_tiers", (query) =>
      query
        .eq("patch", input.patch)
        .eq("championId", input.championId)
        .eq("opponentChampionId", input.opponentChampionId)
        .eq("lane", input.lane)
        .eq("buildType", input.buildType),
    )
    .collect();

  return documents.map(toScopedCandidate);
}

type ChampionLaneTierInput = {
  patch: string;
  championId: string;
  lane: Lane;
  tierGroup: string;
  buildType: StatisticalBuildType;
};

async function loadChampionLaneTierCandidates(
  ctx: QueryCtx,
  input: ChampionLaneTierInput,
): Promise<ScopedCandidate[]> {
  const documents = await ctx.db
    .query("matchupBuildStats")
    .withIndex("by_champion_lane", (query) =>
      query
        .eq("patch", input.patch)
        .eq("championId", input.championId)
        .eq("lane", input.lane)
        .eq("tierGroup", input.tierGroup)
        .eq("buildType", input.buildType),
    )
    .collect();

  return documents.map(toScopedCandidate);
}

type ChampionLaneAllTierInput = Omit<ChampionLaneTierInput, "tierGroup">;

async function loadChampionLaneAllTierCandidates(
  ctx: QueryCtx,
  input: ChampionLaneAllTierInput,
): Promise<ScopedCandidate[]> {
  const documents = await ctx.db
    .query("matchupBuildStats")
    .withIndex("by_champion_lane_all_tiers", (query) =>
      query
        .eq("patch", input.patch)
        .eq("championId", input.championId)
        .eq("lane", input.lane)
        .eq("buildType", input.buildType),
    )
    .collect();

  return documents.map(toScopedCandidate);
}

function toScopedCandidate(document: {
  opponentChampionId: string;
  tierGroup: string;
  orderedItemIds: string[];
  games: number;
  wins: number;
  scopeTotalGames: number;
  rawWinRate: number;
  smoothedWinRate: number;
  pickRate: number;
  confidenceScore: number;
  finalScore: number;
}): ScopedCandidate {
  return {
    scopeKey: `${document.opponentChampionId}:${document.tierGroup}`,
    orderedItemIds: document.orderedItemIds,
    games: document.games,
    wins: document.wins,
    scopeTotalGames: document.scopeTotalGames,
    rawWinRate: document.rawWinRate,
    smoothedWinRate: document.smoothedWinRate,
    pickRate: document.pickRate,
    confidenceScore: document.confidenceScore,
    finalScore: document.finalScore,
  };
}

type CombinedGroup = {
  orderedItemIds: string[];
  games: number;
  wins: number;
  weightedSmoothedWinRate: number;
};

function combineIdenticalBuilds(
  candidates: ScopedCandidate[],
): StatisticalCandidate[] {
  const groups = new Map<string, CombinedGroup>();
  const scopeTotals = new Map<string, number>();

  for (const candidate of candidates) {
    scopeTotals.set(
      candidate.scopeKey,
      Math.max(scopeTotals.get(candidate.scopeKey) ?? 0, candidate.scopeTotalGames),
    );
    const key = candidate.orderedItemIds.join(">");
    const existing = groups.get(key);

    if (existing) {
      existing.games += candidate.games;
      existing.wins += candidate.wins;
      existing.weightedSmoothedWinRate +=
        candidate.smoothedWinRate * candidate.games;
    } else {
      groups.set(key, {
        orderedItemIds: candidate.orderedItemIds,
        games: candidate.games,
        wins: candidate.wins,
        weightedSmoothedWinRate:
          candidate.smoothedWinRate * candidate.games,
      });
    }
  }

  const combinedScopeTotalGames = [...scopeTotals.values()].reduce(
    (total, scopeGames) => total + scopeGames,
    0,
  );

  return [...groups.values()].map((group) => {
    const rawWinRate = group.games > 0 ? group.wins / group.games : 0;
    const smoothedWinRate =
      group.games > 0 ? group.weightedSmoothedWinRate / group.games : 0;
    const pickRate =
      combinedScopeTotalGames > 0
        ? group.games / combinedScopeTotalGames
        : 0;
    const confidenceScore = group.games / (group.games + 300);
    const popularityScore = Math.sqrt(Math.min(Math.max(pickRate, 0), 1));
    const finalScore =
      0.65 * smoothedWinRate +
      0.2 * confidenceScore +
      0.15 * popularityScore;

    return {
      orderedItemIds: group.orderedItemIds,
      games: group.games,
      wins: group.wins,
      scopeTotalGames: combinedScopeTotalGames,
      rawWinRate,
      smoothedWinRate,
      pickRate,
      confidenceScore,
      finalScore,
    };
  });
}

function calculateTotalSampleSize(candidates: StatisticalCandidate[]): number {
  return candidates.reduce(
    (largest, candidate) => Math.max(largest, candidate.scopeTotalGames),
    0,
  );
}

function determineConfidence(input: {
  evidenceLevel: EvidenceLevel;
  sampleSize: number;
}): EvidenceConfidence {
  const isExact =
    input.evidenceLevel === "EXACT_MATCHUP_RANKED" ||
    input.evidenceLevel === "EXACT_MATCHUP_ALL_RANKS";

  if (isExact && input.sampleSize >= 300) {
    return "HIGH";
  }

  if (isExact && input.sampleSize >= 100) {
    return "MEDIUM";
  }

  if (!isExact && input.sampleSize >= 500) {
    return "MEDIUM";
  }

  return "LOW";
}

function assertResolverInput(input: {
  patch: string;
  championId: string;
  opponentChampionId: string;
  preferredTierGroup: string;
}) {
  if (!/^\d+\.\d+$/.test(input.patch)) {
    throw new Error("patch must use major.minor format.");
  }

  if (!/^\d+$/.test(input.championId) || !/^\d+$/.test(input.opponentChampionId)) {
    throw new Error("Champion IDs must be numeric strings.");
  }

  if (!input.preferredTierGroup.trim()) {
    throw new Error("preferredTierGroup is required.");
  }
}
