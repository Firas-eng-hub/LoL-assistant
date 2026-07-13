/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as buildAggregation from "../buildAggregation.js";
import type * as buildCache from "../buildCache.js";
import type * as builds from "../builds.js";
import type * as candidateResolver from "../candidateResolver.js";
import type * as crons from "../crons.js";
import type * as datasetMaintenance from "../datasetMaintenance.js";
import type * as lib_buildStatistics from "../lib/buildStatistics.js";
import type * as lib_buildValidators from "../lib/buildValidators.js";
import type * as lib_dataDragonItems from "../lib/dataDragonItems.js";
import type * as lib_matchProcessing from "../lib/matchProcessing.js";
import type * as lib_recommendationCandidates from "../lib/recommendationCandidates.js";
import type * as lib_riotClient from "../lib/riotClient.js";
import type * as matchSamples from "../matchSamples.js";
import type * as matchupBuildStats from "../matchupBuildStats.js";
import type * as recommendationScoring from "../recommendationScoring.js";
import type * as riotCollector from "../riotCollector.js";
import type * as statisticsAdmin from "../statisticsAdmin.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  buildAggregation: typeof buildAggregation;
  buildCache: typeof buildCache;
  builds: typeof builds;
  candidateResolver: typeof candidateResolver;
  crons: typeof crons;
  datasetMaintenance: typeof datasetMaintenance;
  "lib/buildStatistics": typeof lib_buildStatistics;
  "lib/buildValidators": typeof lib_buildValidators;
  "lib/dataDragonItems": typeof lib_dataDragonItems;
  "lib/matchProcessing": typeof lib_matchProcessing;
  "lib/recommendationCandidates": typeof lib_recommendationCandidates;
  "lib/riotClient": typeof lib_riotClient;
  matchSamples: typeof matchSamples;
  matchupBuildStats: typeof matchupBuildStats;
  recommendationScoring: typeof recommendationScoring;
  riotCollector: typeof riotCollector;
  statisticsAdmin: typeof statisticsAdmin;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
