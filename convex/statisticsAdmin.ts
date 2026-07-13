import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, query } from "./_generated/server";
import { getConfidenceLabel } from "./lib/buildStatistics";
import type { CandidateResolution } from "./lib/recommendationCandidates";

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

type AggregationResult = {
  samplesRead: number;
  startingCandidatesStored: number;
  coreCandidatesStored: number;
};

export const aggregateMatchup = action({
  args: {
    adminToken: v.string(),
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
  handler: async (ctx, args): Promise<AggregationResult> => {
    assertAdminToken(args.adminToken);

    return ctx.runMutation(
      internal.buildAggregation.aggregateExactMatchup,
      {
        patch: args.patch,
        championId: args.championId,
        opponentChampionId: args.opponentChampionId,
        lane: args.lane,
        tierGroup: args.tierGroup,
      },
    );
  },
});

export const inspectCandidates = query({
  args: {
    adminToken: v.string(),
    patch: v.string(),
    championId: v.string(),
    opponentChampionId: v.string(),
    lane: laneValidator,
    tierGroup: v.string(),
    buildType: buildTypeValidator,
  },
  returns: v.array(
    v.object({
      items: v.array(v.string()),
      games: v.number(),
      winRate: v.number(),
      adjustedWinRate: v.number(),
      pickRate: v.number(),
      finalScore: v.number(),
      confidence: v.union(
        v.literal("LOW"),
        v.literal("MEDIUM"),
        v.literal("HIGH"),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    assertAdminToken(args.adminToken);
    const candidates = await ctx.db
      .query("matchupBuildStats")
      .withIndex("by_exact_matchup", (queryBuilder) =>
        queryBuilder
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
      .slice(0, 5)
      .map((candidate) => ({
        items: candidate.orderedItemIds,
        games: candidate.games,
        winRate: toPercent(candidate.rawWinRate),
        adjustedWinRate: toPercent(candidate.smoothedWinRate),
        pickRate: toPercent(candidate.pickRate),
        finalScore: Number(candidate.finalScore.toFixed(4)),
        confidence: getConfidenceLabel(candidate.games),
      }));
  },
});

export const inspectResolvedCandidates = action({
  args: {
    adminToken: v.string(),
    patch: v.string(),
    championId: v.string(),
    opponentChampionId: v.string(),
    lane: laneValidator,
    preferredTierGroup: v.string(),
    buildType: buildTypeValidator,
  },
  returns: v.object({
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
    candidates: v.array(
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
      }),
    ),
  }),
  handler: async (ctx, args): Promise<CandidateResolution> => {
    assertAdminToken(args.adminToken);

    return ctx.runQuery(internal.candidateResolver.resolveCandidates, {
      patch: args.patch,
      championId: args.championId,
      opponentChampionId: args.opponentChampionId,
      lane: args.lane,
      preferredTierGroup: args.preferredTierGroup,
      buildType: args.buildType,
      limit: 3,
    });
  },
});

function assertAdminToken(providedToken: string) {
  const expectedToken = process.env.STATISTICS_ADMIN_TOKEN;

  if (!expectedToken || providedToken !== expectedToken) {
    throw new Error("Statistics administration is not authorized.");
  }
}

function toPercent(value: number): number {
  return Number((value * 100).toFixed(2));
}
