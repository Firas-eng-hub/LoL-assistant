import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  buildEvidenceValidator,
  recommendationValidator,
} from "./lib/buildValidators";

const laneValidator = v.union(
  v.literal("TOP"),
  v.literal("JUNGLE"),
  v.literal("MID"),
  v.literal("ADC"),
  v.literal("SUPPORT"),
);

const playstyleValidator = v.union(
  v.literal("SAFE"),
  v.literal("BALANCED"),
  v.literal("AGGRESSIVE"),
);

export default defineSchema({
  processedMatches: defineTable({
    matchId: v.string(),
    patch: v.string(),
    queueId: v.number(),
    gameDurationSeconds: v.number(),
    processedAt: v.number(),
  }).index("by_match_id", ["matchId"]),
  matchBuildSamples: defineTable({
    matchId: v.string(),
    participantId: v.number(),
    patch: v.string(),
    queueId: v.number(),
    tierGroup: v.string(),
    championId: v.string(),
    opponentChampionId: v.string(),
    lane: laneValidator,
    win: v.boolean(),
    gameDurationSeconds: v.number(),
    startingItemIds: v.array(v.string()),
    coreItemIds: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_match_participant", ["matchId", "participantId"])
    .index("by_matchup", [
      "patch",
      "championId",
      "opponentChampionId",
      "lane",
      "tierGroup",
    ])
    .index("by_champion_lane", [
      "patch",
      "championId",
      "lane",
      "tierGroup",
    ]),
  matchupBuildStats: defineTable({
    statsKey: v.string(),
    patch: v.string(),
    championId: v.string(),
    opponentChampionId: v.string(),
    lane: laneValidator,
    tierGroup: v.string(),
    buildType: v.union(
      v.literal("STARTING"),
      v.literal("CORE"),
    ),
    orderedItemIds: v.array(v.string()),
    games: v.number(),
    wins: v.number(),
    scopeTotalGames: v.number(),
    rawWinRate: v.number(),
    smoothedWinRate: v.number(),
    pickRate: v.number(),
    confidenceScore: v.number(),
    finalScore: v.number(),
    updatedAt: v.number(),
  })
    .index("by_stats_key", ["statsKey"])
    .index("by_exact_matchup", [
      "patch",
      "championId",
      "opponentChampionId",
      "lane",
      "tierGroup",
      "buildType",
    ])
    .index("by_exact_matchup_all_tiers", [
      "patch",
      "championId",
      "opponentChampionId",
      "lane",
      "buildType",
    ])
    .index("by_matchup_scope", [
      "patch",
      "championId",
      "opponentChampionId",
      "lane",
      "tierGroup",
    ])
    .index("by_champion_lane", [
      "patch",
      "championId",
      "lane",
      "tierGroup",
      "buildType",
    ])
    .index("by_champion_lane_all_tiers", [
      "patch",
      "championId",
      "lane",
      "buildType",
    ]),
  collectorState: defineTable({
    collectorName: v.string(),
    platform: v.string(),
    region: v.string(),
    lastCursor: v.optional(v.string()),
    matchesRequested: v.number(),
    matchesProcessed: v.number(),
    samplesCreated: v.number(),
    status: v.union(
      v.literal("IDLE"),
      v.literal("RUNNING"),
      v.literal("PAUSED"),
      v.literal("ERROR"),
    ),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  }).index("by_collector_name", ["collectorName"]),
  datasetRefreshState: defineTable({
    refreshName: v.string(),
    patch: v.string(),
    nextPlayerOffset: v.number(),
    lastRunAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    status: v.union(
      v.literal("IDLE"),
      v.literal("RUNNING"),
      v.literal("ERROR"),
    ),
    lastError: v.optional(v.string()),
  }).index("by_refresh_name", ["refreshName"]),
  buildCache: defineTable({
    cacheKey: v.string(),
    playerChampionId: v.string(),
    enemyChampionId: v.string(),
    lane: laneValidator,
    playstyle: playstyleValidator,
    dataDragonVersion: v.string(),
    recommendation: recommendationValidator,
    evidence: buildEvidenceValidator,
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_cache_key", ["cacheKey"])
    .index("by_expires_at", ["expiresAt"]),
});
