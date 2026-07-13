import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
} from "./_generated/server";
import {
  calculateBuildStatistics,
  getConfidenceLabel,
} from "./lib/buildStatistics";

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
type BuildType = "STARTING" | "CORE";

type AggregatedBuild = {
  orderedItemIds: string[];
  games: number;
  wins: number;
};

// Store sparse exact-scope groups so identical builds can accumulate across
// opponents and tiers. The resolver still requires five combined games before
// a candidate can be selected.
const MINIMUM_CANDIDATE_GAMES = 1;
const MAX_SAMPLES_PER_AGGREGATION = 5000;
const MAX_CANDIDATES_PER_BUILD_TYPE = 5;

export const aggregateExactMatchup = internalMutation({
  args: {
    patch: v.string(),
    championId: v.string(),
    opponentChampionId: v.string(),
    lane: laneValidator,
    tierGroup: v.string(),
  },
  returns: v.object({
    samplesRead: v.number(),
    startingCandidatesStored: v.number(),
    coreCandidatesStored: v.number(),
  }),
  handler: async (ctx, args) => {
    assertAggregationScope(args);

    const samples = await ctx.db
      .query("matchBuildSamples")
      .withIndex("by_matchup", (query) =>
        query
          .eq("patch", args.patch)
          .eq("championId", args.championId)
          .eq("opponentChampionId", args.opponentChampionId)
          .eq("lane", args.lane)
          .eq("tierGroup", args.tierGroup),
      )
      .take(MAX_SAMPLES_PER_AGGREGATION + 1);

    if (samples.length > MAX_SAMPLES_PER_AGGREGATION) {
      throw new Error(
        "The matchup exceeds the aggregation safety limit and must be batched.",
      );
    }

    const existingStats = await ctx.db
      .query("matchupBuildStats")
      .withIndex("by_matchup_scope", (query) =>
        query
          .eq("patch", args.patch)
          .eq("championId", args.championId)
          .eq("opponentChampionId", args.opponentChampionId)
          .eq("lane", args.lane)
          .eq("tierGroup", args.tierGroup),
      )
      .collect();

    for (const document of existingStats) {
      await ctx.db.delete(document._id);
    }

    if (samples.length === 0) {
      return {
        samplesRead: 0,
        startingCandidatesStored: 0,
        coreCandidatesStored: 0,
      };
    }

    const wins = samples.filter((sample) => sample.win).length;
    const baselineWinRate = wins / samples.length;
    const startingGroups = groupBuilds(
      samples.map((sample) => ({
        itemIds: normalizeStartingItems(sample.startingItemIds),
        win: sample.win,
      })),
    );
    const coreGroups = groupBuilds(
      samples.map((sample) => ({
        itemIds: normalizeCoreItems(sample.coreItemIds),
        win: sample.win,
      })),
    );
    const updatedAt = Date.now();
    const startingCandidatesStored = await storeGroups({
      ctx,
      args,
      buildType: "STARTING",
      groups: startingGroups,
      totalMatchupGames: samples.length,
      baselineWinRate,
      updatedAt,
    });
    const coreCandidatesStored = await storeGroups({
      ctx,
      args,
      buildType: "CORE",
      groups: coreGroups,
      totalMatchupGames: samples.length,
      baselineWinRate,
      updatedAt,
    });

    return {
      samplesRead: samples.length,
      startingCandidatesStored,
      coreCandidatesStored,
    };
  },
});

export const getTopExactCandidates = internalQuery({
  args: {
    patch: v.string(),
    championId: v.string(),
    opponentChampionId: v.string(),
    lane: laneValidator,
    tierGroup: v.string(),
    buildType: buildTypeValidator,
    limit: v.optional(v.number()),
  },
  returns: v.array(
    v.object({
      orderedItemIds: v.array(v.string()),
      games: v.number(),
      wins: v.number(),
      scopeTotalGames: v.number(),
      rawWinRate: v.number(),
      smoothedWinRate: v.number(),
      pickRate: v.number(),
      confidenceScore: v.number(),
      finalScore: v.number(),
      confidence: v.union(
        v.literal("LOW"),
        v.literal("MEDIUM"),
        v.literal("HIGH"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(Math.floor(args.limit ?? 3), 1), 10);
    const candidates = await ctx.db
      .query("matchupBuildStats")
      .withIndex("by_exact_matchup", (query) =>
        query
          .eq("patch", args.patch)
          .eq("championId", args.championId)
          .eq("opponentChampionId", args.opponentChampionId)
          .eq("lane", args.lane)
          .eq("tierGroup", args.tierGroup)
          .eq("buildType", args.buildType),
      )
      .collect();

    return candidates
      .sort((first, second) => second.finalScore - first.finalScore)
      .slice(0, limit)
      .map((candidate) => ({
        orderedItemIds: candidate.orderedItemIds,
        games: candidate.games,
        wins: candidate.wins,
        scopeTotalGames: candidate.scopeTotalGames,
        rawWinRate: candidate.rawWinRate,
        smoothedWinRate: candidate.smoothedWinRate,
        pickRate: candidate.pickRate,
        confidenceScore: candidate.confidenceScore,
        finalScore: candidate.finalScore,
        confidence: getConfidenceLabel(candidate.games),
      }));
  },
});

type StoreGroupsInput = {
  ctx: MutationCtx;
  args: {
    patch: string;
    championId: string;
    opponentChampionId: string;
    lane: Lane;
    tierGroup: string;
  };
  buildType: BuildType;
  groups: AggregatedBuild[];
  totalMatchupGames: number;
  baselineWinRate: number;
  updatedAt: number;
};

async function storeGroups(input: StoreGroupsInput): Promise<number> {
  let stored = 0;

  for (const group of input.groups.slice(0, MAX_CANDIDATES_PER_BUILD_TYPE)) {
    if (group.games < MINIMUM_CANDIDATE_GAMES) {
      continue;
    }

    const statistics = calculateBuildStatistics({
      wins: group.wins,
      games: group.games,
      totalMatchupGames: input.totalMatchupGames,
      baselineWinRate: input.baselineWinRate,
    });
    const statsKey = createStatsKey({
      ...input.args,
      buildType: input.buildType,
      orderedItemIds: group.orderedItemIds,
    });

    await input.ctx.db.insert("matchupBuildStats", {
      statsKey,
      patch: input.args.patch,
      championId: input.args.championId,
      opponentChampionId: input.args.opponentChampionId,
      lane: input.args.lane,
      tierGroup: input.args.tierGroup,
      buildType: input.buildType,
      orderedItemIds: group.orderedItemIds,
      games: group.games,
      wins: group.wins,
      scopeTotalGames: input.totalMatchupGames,
      ...statistics,
      updatedAt: input.updatedAt,
    });
    stored += 1;
  }

  return stored;
}

function groupBuilds(
  records: Array<{ itemIds: string[]; win: boolean }>,
): AggregatedBuild[] {
  const groups = new Map<string, AggregatedBuild>();

  for (const record of records) {
    if (record.itemIds.length === 0) {
      continue;
    }

    const key = record.itemIds.join(">");
    const existing = groups.get(key);

    if (existing) {
      existing.games += 1;
      existing.wins += record.win ? 1 : 0;
    } else {
      groups.set(key, {
        orderedItemIds: record.itemIds,
        games: 1,
        wins: record.win ? 1 : 0,
      });
    }
  }

  return [...groups.values()].sort(
    (first, second) => second.games - first.games,
  );
}

function normalizeStartingItems(itemIds: string[]): string[] {
  return itemIds.filter(isValidItemId).sort(compareItemIds);
}

function normalizeCoreItems(itemIds: string[]): string[] {
  const uniqueItems: string[] = [];

  for (const itemId of itemIds) {
    if (isValidItemId(itemId) && !uniqueItems.includes(itemId)) {
      uniqueItems.push(itemId);
    }
  }

  return uniqueItems.slice(0, 3);
}

function isValidItemId(value: string): boolean {
  return /^\d+$/.test(value) && value !== "0";
}

function compareItemIds(first: string, second: string): number {
  return Number(first) - Number(second);
}

function createStatsKey(input: {
  patch: string;
  championId: string;
  opponentChampionId: string;
  lane: Lane;
  tierGroup: string;
  buildType: BuildType;
  orderedItemIds: string[];
}): string {
  return [
    input.patch,
    input.championId,
    input.opponentChampionId,
    input.lane,
    input.tierGroup,
    input.buildType,
    input.orderedItemIds.join(">"),
  ]
    .map((value) => value.trim().toLowerCase())
    .join(":");
}

function assertAggregationScope(input: {
  patch: string;
  championId: string;
  opponentChampionId: string;
  tierGroup: string;
}) {
  if (!/^\d+\.\d+$/.test(input.patch)) {
    throw new Error("patch must use major.minor format.");
  }

  if (!/^\d+$/.test(input.championId) || !/^\d+$/.test(input.opponentChampionId)) {
    throw new Error("Champion IDs must be numeric strings.");
  }

  if (input.championId === input.opponentChampionId) {
    throw new Error("Champion and opponent IDs must be different.");
  }

  if (!input.tierGroup.trim()) {
    throw new Error("tierGroup is required.");
  }
}
