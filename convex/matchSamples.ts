import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";

const laneValidator = v.union(
  v.literal("TOP"),
  v.literal("JUNGLE"),
  v.literal("MID"),
  v.literal("ADC"),
  v.literal("SUPPORT"),
);

const sampleValidator = v.object({
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
});

export const isMatchProcessed = internalQuery({
  args: { matchId: v.string() },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const match = await ctx.db
      .query("processedMatches")
      .withIndex("by_match_id", (query) => query.eq("matchId", args.matchId))
      .unique();

    return Boolean(match);
  },
});

export const saveProcessedMatch = internalMutation({
  args: {
    matchId: v.string(),
    patch: v.string(),
    queueId: v.number(),
    gameDurationSeconds: v.number(),
    samples: v.array(sampleValidator),
    processedAt: v.number(),
  },
  returns: v.object({ insertedSamples: v.number() }),
  handler: async (ctx, args) => {
    const previousMatch = await ctx.db
      .query("processedMatches")
      .withIndex("by_match_id", (query) => query.eq("matchId", args.matchId))
      .unique();

    if (previousMatch) {
      return { insertedSamples: 0 };
    }

    let insertedSamples = 0;

    for (const sample of args.samples) {
      const existingSample = await ctx.db
        .query("matchBuildSamples")
        .withIndex("by_match_participant", (query) =>
          query
            .eq("matchId", sample.matchId)
            .eq("participantId", sample.participantId),
        )
        .unique();

      if (existingSample) {
        continue;
      }

      await ctx.db.insert("matchBuildSamples", {
        ...sample,
        createdAt: args.processedAt,
      });
      insertedSamples += 1;
    }

    await ctx.db.insert("processedMatches", {
      matchId: args.matchId,
      patch: args.patch,
      queueId: args.queueId,
      gameDurationSeconds: args.gameDurationSeconds,
      processedAt: args.processedAt,
    });

    return { insertedSamples };
  },
});

export const updateCollectorState = internalMutation({
  args: {
    collectorName: v.string(),
    platform: v.string(),
    region: v.string(),
    requestedDelta: v.number(),
    processedDelta: v.number(),
    samplesDelta: v.number(),
    lastCursor: v.optional(v.string()),
    status: v.union(
      v.literal("IDLE"),
      v.literal("RUNNING"),
      v.literal("PAUSED"),
      v.literal("ERROR"),
    ),
    lastError: v.optional(v.string()),
    updatedAt: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("collectorState")
      .withIndex("by_collector_name", (query) =>
        query.eq("collectorName", args.collectorName),
      )
      .unique();
    const document = {
      collectorName: args.collectorName,
      platform: args.platform,
      region: args.region,
      matchesRequested:
        (existing?.matchesRequested ?? 0) + args.requestedDelta,
      matchesProcessed:
        (existing?.matchesProcessed ?? 0) + args.processedDelta,
      samplesCreated: (existing?.samplesCreated ?? 0) + args.samplesDelta,
      status: args.status,
      updatedAt: args.updatedAt,
      ...((args.lastCursor ?? existing?.lastCursor) !== undefined
        ? { lastCursor: args.lastCursor ?? existing?.lastCursor }
        : {}),
      ...(args.lastError !== undefined ? { lastError: args.lastError } : {}),
    };

    if (existing) {
      await ctx.db.replace(existing._id, document);
    } else {
      await ctx.db.insert("collectorState", document);
    }

    return null;
  },
});
