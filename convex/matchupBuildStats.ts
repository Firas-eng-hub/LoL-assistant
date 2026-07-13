import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

type LegacyCandidateResult = {
  specificity:
    | "EXACT_MATCHUP"
    | "MATCHUP_ALL_RANKS"
    | "DAMAGE_PROFILE"
    | "CHAMPION_LANE"
    | "RECENT_PATCHES";
  records: Array<{
    patch: string;
    startingItemIds: string[];
    firstRecallItemIds: string[];
    coreItemIds: string[];
    games: number;
    wins: number;
    winRate: number;
    averageGameDuration: number;
    updatedAt: number;
  }>;
};

const laneValidator = v.union(
  v.literal("TOP"),
  v.literal("JUNGLE"),
  v.literal("MID"),
  v.literal("ADC"),
  v.literal("SUPPORT"),
);

/**
 * Compatibility boundary for the existing full recommendation action.
 * Stage 1 aggregates starting and core builds but has no first-recall evidence,
 * so returning candidates here would falsely imply that a complete build can
 * be generated from the available statistics.
 */
export const getCandidateRecords = internalQuery({
  args: {
    patch: v.string(),
    championId: v.string(),
    opponentChampionId: v.string(),
    lane: laneValidator,
    tierGroup: v.string(),
    enemyDamageProfile: v.optional(
      v.union(
        v.literal("PHYSICAL"),
        v.literal("MAGIC"),
        v.literal("MIXED"),
        v.literal("TRUE"),
      ),
    ),
  },
  returns: v.union(
    v.null(),
    v.object({
      specificity: v.union(
        v.literal("EXACT_MATCHUP"),
        v.literal("MATCHUP_ALL_RANKS"),
        v.literal("DAMAGE_PROFILE"),
        v.literal("CHAMPION_LANE"),
        v.literal("RECENT_PATCHES"),
      ),
      records: v.array(
        v.object({
          patch: v.string(),
          startingItemIds: v.array(v.string()),
          firstRecallItemIds: v.array(v.string()),
          coreItemIds: v.array(v.string()),
          games: v.number(),
          wins: v.number(),
          winRate: v.number(),
          averageGameDuration: v.number(),
          updatedAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (): Promise<LegacyCandidateResult | null> => null,
});
