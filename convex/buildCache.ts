import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
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

export const getValidRecommendation = internalQuery({
  args: {
    cacheKey: v.string(),
    currentTime: v.number(),
  },
  returns: v.union(
    v.null(),
    v.object({
      recommendation: recommendationValidator,
      evidence: buildEvidenceValidator,
      createdAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const cachedBuild = await ctx.db
      .query("buildCache")
      .withIndex("by_cache_key", (query) =>
        query.eq("cacheKey", args.cacheKey),
      )
      .unique();

    if (
      !cachedBuild ||
      cachedBuild.expiresAt <= args.currentTime
    ) {
      return null;
    }

    return {
      recommendation: cachedBuild.recommendation,
      evidence: cachedBuild.evidence,
      createdAt: cachedBuild.createdAt,
    };
  },
});

export const saveRecommendation = internalMutation({
  args: {
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existingBuild = await ctx.db
      .query("buildCache")
      .withIndex("by_cache_key", (query) =>
        query.eq("cacheKey", args.cacheKey),
      )
      .unique();

    const document = {
      cacheKey: args.cacheKey,
      playerChampionId: args.playerChampionId,
      enemyChampionId: args.enemyChampionId,
      lane: args.lane,
      playstyle: args.playstyle,
      dataDragonVersion: args.dataDragonVersion,
      recommendation: args.recommendation,
      evidence: args.evidence,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    };

    if (existingBuild) {
      await ctx.db.replace(existingBuild._id, document);
    } else {
      await ctx.db.insert("buildCache", document);
    }

    return null;
  },
});

export const removeExpiredRecommendations = internalMutation({
  args: {
    currentTime: v.number(),
    limit: v.optional(v.number()),
  },
  returns: v.number(),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(Math.floor(args.limit ?? 100), 500));
    const expiredDocuments = await ctx.db
      .query("buildCache")
      .withIndex("by_expires_at", (query) =>
        query.lte("expiresAt", args.currentTime),
      )
      .take(limit);

    for (const document of expiredDocuments) {
      await ctx.db.delete(document._id);
    }

    return expiredDocuments.length;
  },
});
