import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./_generated/server";
import { getCurrentDataDragonPatch } from "./lib/dataDragonItems";

const REFRESH_NAME = "euw1-challenger-hourly";
const MATCHES_PER_PLAYER = 10;

type RefreshState = {
  patch: string;
  nextPlayerOffset: number;
} | null;

type PopulationResult = {
  playersAttempted: number;
  playersCompleted: number;
  playerErrors: number;
  requested: number;
  processed: number;
  skipped: number;
  samplesCreated: number;
  scopesAggregated: number;
  aggregationErrors: number;
  startingCandidatesStored: number;
  coreCandidatesStored: number;
  nextPlayerOffset: number;
};

export const getRefreshState = internalQuery({
  args: { refreshName: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      patch: v.string(),
      nextPlayerOffset: v.number(),
    }),
  ),
  handler: async (ctx, args): Promise<RefreshState> => {
    const state = await ctx.db
      .query("datasetRefreshState")
      .withIndex("by_refresh_name", (query) =>
        query.eq("refreshName", args.refreshName),
      )
      .unique();

    return state
      ? { patch: state.patch, nextPlayerOffset: state.nextPlayerOffset }
      : null;
  },
});

export const saveRefreshState = internalMutation({
  args: {
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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("datasetRefreshState")
      .withIndex("by_refresh_name", (query) =>
        query.eq("refreshName", args.refreshName),
      )
      .unique();
    const document = {
      refreshName: args.refreshName,
      patch: args.patch,
      nextPlayerOffset: args.nextPlayerOffset,
      lastRunAt: args.lastRunAt,
      status: args.status,
      ...((args.lastSuccessAt ?? existing?.lastSuccessAt) !== undefined
        ? { lastSuccessAt: args.lastSuccessAt ?? existing?.lastSuccessAt }
        : {}),
      ...(args.lastError !== undefined ? { lastError: args.lastError } : {}),
    };

    if (existing) {
      await ctx.db.replace(existing._id, document);
    } else {
      await ctx.db.insert("datasetRefreshState", document);
    }

    return null;
  },
});

export const refreshEuwDataset = internalAction({
  args: {},
  returns: v.object({
    patch: v.string(),
    playerOffset: v.number(),
    nextPlayerOffset: v.number(),
    playersCompleted: v.number(),
    matchesProcessed: v.number(),
    samplesCreated: v.number(),
    scopesAggregated: v.number(),
  }),
  handler: async (ctx): Promise<{
    patch: string;
    playerOffset: number;
    nextPlayerOffset: number;
    playersCompleted: number;
    matchesProcessed: number;
    samplesCreated: number;
    scopesAggregated: number;
  }> => {
    const patch = await getCurrentDataDragonPatch();
    const state = await ctx.runQuery(internal.datasetMaintenance.getRefreshState, {
      refreshName: REFRESH_NAME,
    });
    const playerOffset = state?.patch === patch ? state.nextPlayerOffset : 0;
    const startedAt = Date.now();

    await ctx.runMutation(internal.datasetMaintenance.saveRefreshState, {
      refreshName: REFRESH_NAME,
      patch,
      nextPlayerOffset: playerOffset,
      lastRunAt: startedAt,
      status: "RUNNING",
    });

    try {
      let result: PopulationResult = await ctx.runAction(
        internal.riotCollector.populateEuwChallenger,
        {
          expectedPatch: patch,
          playerOffset,
          playerCount: 1,
          matchStart: 0,
          matchesPerPlayer: MATCHES_PER_PLAYER,
        },
      );
      let effectiveOffset = playerOffset;

      // Reaching the end of the current Challenger ladder wraps the cursor.
      if (result.playersAttempted === 0 && playerOffset > 0) {
        effectiveOffset = 0;
        result = await ctx.runAction(
          internal.riotCollector.populateEuwChallenger,
          {
            expectedPatch: patch,
            playerOffset: 0,
            playerCount: 1,
            matchStart: 0,
            matchesPerPlayer: MATCHES_PER_PLAYER,
          },
        );
      }

      if (result.playersAttempted === 0 || result.playersCompleted === 0) {
        throw new Error(
          result.playerErrors > 0
            ? "The scheduled EUW seed failed to collect."
            : "The EUW Challenger ladder returned no usable players.",
        );
      }

      const completedAt = Date.now();

      await ctx.runMutation(internal.datasetMaintenance.saveRefreshState, {
        refreshName: REFRESH_NAME,
        patch,
        nextPlayerOffset: result.nextPlayerOffset,
        lastRunAt: startedAt,
        lastSuccessAt: completedAt,
        status: "IDLE",
      });

      return {
        patch,
        playerOffset: effectiveOffset,
        nextPlayerOffset: result.nextPlayerOffset,
        playersCompleted: result.playersCompleted,
        matchesProcessed: result.processed,
        samplesCreated: result.samplesCreated,
        scopesAggregated: result.scopesAggregated,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown EUW refresh error.";

      await ctx.runMutation(internal.datasetMaintenance.saveRefreshState, {
        refreshName: REFRESH_NAME,
        patch,
        nextPlayerOffset: playerOffset,
        lastRunAt: startedAt,
        status: "ERROR",
        lastError: message.slice(0, 500),
      });
      throw error;
    }
  },
});
