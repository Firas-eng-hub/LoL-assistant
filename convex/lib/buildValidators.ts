import { v } from "convex/values";

export const buildItemValidator = v.object({
  id: v.string(),
  name: v.string(),
  imageUrl: v.string(),
  reason: v.string(),
});

export const buildEvidenceValidator = v.object({
  level: v.union(
    v.literal("EXACT_MATCHUP_RANKED"),
    v.literal("EXACT_MATCHUP_ALL_RANKS"),
    v.literal("CHAMPION_LANE_RANKED"),
    v.literal("CHAMPION_LANE_ALL_RANKS"),
    v.literal("AI_FALLBACK"),
  ),
  confidence: v.union(
    v.literal("LOW"),
    v.literal("MEDIUM"),
    v.literal("HIGH"),
  ),
  sampleSize: v.number(),
  startingBuildGames: v.number(),
  coreBuildGames: v.number(),
  startingRawWinRate: v.union(v.number(), v.null()),
  coreRawWinRate: v.union(v.number(), v.null()),
});

export const recommendationValidator = v.object({
  summary: v.string(),
  matchupTip: v.string(),
  startingItems: v.array(buildItemValidator),
  firstRecall: v.array(
    v.object({
      title: v.string(),
      condition: v.string(),
      items: v.array(buildItemValidator),
    }),
  ),
  coreBuild: v.array(buildItemValidator),
  situationalItems: v.array(
    v.object({
      item: buildItemValidator,
      condition: v.string(),
    }),
  ),
  evidence: buildEvidenceValidator,
});
