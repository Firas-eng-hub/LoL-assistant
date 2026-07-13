import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, type ActionCtx } from "./_generated/server";
import {
  getEuwChallengerPuuids,
  getMatch,
  getMatchIdsByPuuid,
  getTimeline,
} from "./lib/riotClient";
import {
  createSamplesFromMatch,
  extractPatch,
  type SupportedLane,
} from "./lib/matchProcessing";
import { getCompletedItemIdsForPatch } from "./lib/dataDragonItems";

const MAX_MATCHES_PER_RUN = 20;
const MAX_PLAYERS_PER_POPULATION_RUN = 2;
const COLLECTOR_NAME = "stage1-euw1-ranked-solo";
const PLATFORM = "EUW1";
const REGION = "EUROPE";

const tierGroupValidator = v.union(
  v.literal("EMERALD_PLUS"),
  v.literal("ALL_RANKS"),
);

const collectionResultValidator = v.object({
  requested: v.number(),
  processed: v.number(),
  skipped: v.number(),
  samplesCreated: v.number(),
  errors: v.number(),
  nextStart: v.number(),
  scopesAggregated: v.number(),
  aggregationErrors: v.number(),
  startingCandidatesStored: v.number(),
  coreCandidatesStored: v.number(),
});

type TierGroup = "EMERALD_PLUS" | "ALL_RANKS";

type CollectionResult = {
  requested: number;
  processed: number;
  skipped: number;
  samplesCreated: number;
  errors: number;
  nextStart: number;
  scopesAggregated: number;
  aggregationErrors: number;
  startingCandidatesStored: number;
  coreCandidatesStored: number;
};

type MatchupScope = {
  patch: string;
  championId: string;
  opponentChampionId: string;
  lane: SupportedLane;
  tierGroup: string;
};

export const collectPlayerMatches = internalAction({
  args: {
    puuid: v.string(),
    expectedPatch: v.string(),
    tierGroup: tierGroupValidator,
    start: v.optional(v.number()),
    count: v.optional(v.number()),
  },
  returns: collectionResultValidator,
  handler: async (ctx, args): Promise<CollectionResult> => {
    return collectMatchesForPlayer(ctx, {
      puuid: args.puuid,
      expectedPatch: args.expectedPatch,
      tierGroup: args.tierGroup,
      start: normalizeStart(args.start),
      count: normalizeCount(args.count),
    });
  },
});

export const populateEuwChallenger = internalAction({
  args: {
    expectedPatch: v.string(),
    playerOffset: v.optional(v.number()),
    playerCount: v.optional(v.number()),
    matchStart: v.optional(v.number()),
    matchesPerPlayer: v.optional(v.number()),
  },
  returns: v.object({
    playersAttempted: v.number(),
    playersCompleted: v.number(),
    playerErrors: v.number(),
    requested: v.number(),
    processed: v.number(),
    skipped: v.number(),
    samplesCreated: v.number(),
    scopesAggregated: v.number(),
    aggregationErrors: v.number(),
    startingCandidatesStored: v.number(),
    coreCandidatesStored: v.number(),
    nextPlayerOffset: v.number(),
  }),
  handler: async (ctx, args): Promise<{
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
  }> => {
    assertPatch(args.expectedPatch);
    const playerOffset = normalizeStart(args.playerOffset);
    const playerCount = Math.min(
      Math.max(Math.floor(args.playerCount ?? 1), 1),
      MAX_PLAYERS_PER_POPULATION_RUN,
    );
    const matchStart = normalizeStart(args.matchStart);
    const matchesPerPlayer = Math.min(
      normalizeCount(args.matchesPerPlayer ?? 10),
      10,
    );
    const puuids = (await getEuwChallengerPuuids()).slice(
      playerOffset,
      playerOffset + playerCount,
    );
    const totals = {
      playersAttempted: puuids.length,
      playersCompleted: 0,
      playerErrors: 0,
      requested: 0,
      processed: 0,
      skipped: 0,
      samplesCreated: 0,
      scopesAggregated: 0,
      aggregationErrors: 0,
      startingCandidatesStored: 0,
      coreCandidatesStored: 0,
      nextPlayerOffset: playerOffset + puuids.length,
    };

    for (const puuid of puuids) {
      try {
        const result = await collectMatchesForPlayer(ctx, {
          puuid,
          expectedPatch: args.expectedPatch,
          tierGroup: "EMERALD_PLUS",
          start: matchStart,
          count: matchesPerPlayer,
        });

        totals.playersCompleted += 1;
        totals.requested += result.requested;
        totals.processed += result.processed;
        totals.skipped += result.skipped;
        totals.samplesCreated += result.samplesCreated;
        totals.scopesAggregated += result.scopesAggregated;
        totals.aggregationErrors += result.aggregationErrors;
        totals.startingCandidatesStored += result.startingCandidatesStored;
        totals.coreCandidatesStored += result.coreCandidatesStored;
      } catch (error) {
        totals.playerErrors += 1;
        console.error("EUW Challenger seed collection failed:", error);
      }
    }

    return totals;
  },
});

async function collectMatchesForPlayer(
  ctx: ActionCtx,
  input: {
    puuid: string;
    expectedPatch: string;
    tierGroup: TierGroup;
    start: number;
    count: number;
  },
): Promise<CollectionResult> {
  if (!input.puuid.trim()) {
    throw new Error("A PUUID is required.");
  }

  assertPatch(input.expectedPatch);
  await updateCollectorState(ctx, {
    status: "RUNNING",
    requestedDelta: 0,
    processedDelta: 0,
    samplesDelta: 0,
  });

  try {
    const completedItemIds = await getCompletedItemIdsForPatch(
      input.expectedPatch,
    );
    const matchIds = await getMatchIdsByPuuid(input.puuid, {
      start: input.start,
      count: input.count,
      queue: 420,
    });
    const changedScopes = new Map<string, MatchupScope>();
    let processed = 0;
    let skipped = 0;
    let samplesCreated = 0;
    let errors = 0;

    for (const matchId of matchIds) {
      const alreadyProcessed = await ctx.runQuery(
        internal.matchSamples.isMatchProcessed,
        { matchId },
      );

      if (alreadyProcessed) {
        skipped += 1;
        continue;
      }

      try {
        const [match, timeline] = await Promise.all([
          getMatch(matchId),
          getTimeline(matchId),
        ]);
        const patch = extractPatch(match.info.gameVersion);
        const samples = createSamplesFromMatch(match, timeline, {
          expectedPatch: input.expectedPatch,
          tierGroup: input.tierGroup,
          completedItemIds,
        });
        const result = await ctx.runMutation(
          internal.matchSamples.saveProcessedMatch,
          {
            matchId,
            patch,
            queueId: match.info.queueId,
            gameDurationSeconds: match.info.gameDuration,
            samples,
            processedAt: Date.now(),
          },
        );

        if (result.insertedSamples > 0) {
          for (const sample of samples) {
            const scope = {
              patch: sample.patch,
              championId: sample.championId,
              opponentChampionId: sample.opponentChampionId,
              lane: sample.lane,
              tierGroup: sample.tierGroup,
            };
            changedScopes.set(scopeKey(scope), scope);
          }
        }

        samplesCreated += result.insertedSamples;
        processed += 1;
      } catch (error) {
        errors += 1;
        console.error(`Failed to process ${matchId}:`, error);
      }
    }

    const aggregation = await aggregateChangedScopes(ctx, changedScopes);
    const nextStart = input.start + matchIds.length;

    await updateCollectorState(ctx, {
      status: errors > 0 || aggregation.errors > 0 ? "ERROR" : "IDLE",
      requestedDelta: matchIds.length,
      processedDelta: processed,
      samplesDelta: samplesCreated,
      lastCursor: `${input.puuid}:${nextStart}`,
      lastError:
        errors > 0 || aggregation.errors > 0
          ? `${errors} match and ${aggregation.errors} aggregation error(s).`
          : undefined,
    });

    return {
      requested: matchIds.length,
      processed,
      skipped,
      samplesCreated,
      errors,
      nextStart,
      scopesAggregated: aggregation.scopes,
      aggregationErrors: aggregation.errors,
      startingCandidatesStored: aggregation.startingCandidates,
      coreCandidatesStored: aggregation.coreCandidates,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown collector error.";

    await updateCollectorState(ctx, {
      status: "ERROR",
      requestedDelta: 0,
      processedDelta: 0,
      samplesDelta: 0,
      lastError: message.slice(0, 500),
    });
    throw error;
  }
}

async function aggregateChangedScopes(
  ctx: ActionCtx,
  scopes: Map<string, MatchupScope>,
): Promise<{
  scopes: number;
  errors: number;
  startingCandidates: number;
  coreCandidates: number;
}> {
  let aggregated = 0;
  let errors = 0;
  let startingCandidates = 0;
  let coreCandidates = 0;

  for (const scope of scopes.values()) {
    try {
      const result = await ctx.runMutation(
        internal.buildAggregation.aggregateExactMatchup,
        scope,
      );
      aggregated += 1;
      startingCandidates += result.startingCandidatesStored;
      coreCandidates += result.coreCandidatesStored;
    } catch (error) {
      errors += 1;
      console.error("Failed to aggregate changed matchup scope:", error);
    }
  }

  return {
    scopes: aggregated,
    errors,
    startingCandidates,
    coreCandidates,
  };
}

function normalizeStart(value: number | undefined): number {
  return Math.max(Math.floor(value ?? 0), 0);
}

function normalizeCount(value: number | undefined): number {
  return Math.min(
    Math.max(Math.floor(value ?? 5), 1),
    MAX_MATCHES_PER_RUN,
  );
}

function assertPatch(patch: string): void {
  if (!/^\d+\.\d+$/.test(patch)) {
    throw new Error("expectedPatch must use major.minor format.");
  }
}

function scopeKey(scope: MatchupScope): string {
  return [
    scope.patch,
    scope.championId,
    scope.opponentChampionId,
    scope.lane,
    scope.tierGroup,
  ].join(":");
}

async function updateCollectorState(
  ctx: ActionCtx,
  input: {
    status: "IDLE" | "RUNNING" | "PAUSED" | "ERROR";
    requestedDelta: number;
    processedDelta: number;
    samplesDelta: number;
    lastCursor?: string;
    lastError?: string;
  },
) {
  await ctx.runMutation(internal.matchSamples.updateCollectorState, {
    collectorName: COLLECTOR_NAME,
    platform: PLATFORM,
    region: REGION,
    requestedDelta: input.requestedDelta,
    processedDelta: input.processedDelta,
    samplesDelta: input.samplesDelta,
    status: input.status,
    updatedAt: Date.now(),
    ...(input.lastCursor !== undefined
      ? { lastCursor: input.lastCursor }
      : {}),
    ...(input.lastError !== undefined ? { lastError: input.lastError } : {}),
  });
}
