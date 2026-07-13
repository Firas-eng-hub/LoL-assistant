# LaneForge

LaneForge is a matchup-based League of Legends build assistant built with
Next.js and Convex. Data Dragon supplies current-patch champion and item data.
The backend selects the highest-scoring statistical starting and core
sequences. Groq explains those locked sequences and supplies only the
first-recall and situational sections that Stage 1 does not yet aggregate.

## Local development

```bash
npm run dev
```

Convex must also be running for backend changes:

```bash
npx convex dev
```

## Statistical recommendation pipeline

The user-facing action prefers aggregated records in `matchupBuildStats`. When
either starting or core evidence is insufficient, that section uses a tightly
validated current-patch AI fallback and the entire result is labeled
`AI_FALLBACK` with `LOW` confidence.

Candidate resolution uses this explicit fallback order:

1. Exact matchup in the preferred ranked tier group.
2. Exact matchup across all stored tier groups.
3. Champion and lane in the preferred ranked tier group.
4. Champion and lane across all stored tier groups.
5. `NO_STATISTICAL_DATA` when none of those scopes meets the sample threshold;
   the recommendation layer then uses the explicitly labeled AI fallback.

The response always exposes the selected evidence level. Champion-and-lane
fallbacks are never described as exact-matchup evidence, and their confidence
is capped at `MEDIUM`.

Stage 1 now provides controlled EUW1 ingestion actions. They:

1. Accept a seed player's PUUID or select verified EUW Challenger ladder seeds.
2. Fetch paginated Ranked Solo/Duo matches from EUROPE routing.
3. Keep the requested `major.minor` patch and matches lasting at least 15
   minutes.
4. Reconstruct starting purchases and an initial ordered core-item sequence.
5. Write idempotent participant samples and track processed matches.
6. Automatically re-aggregate every matchup scope changed by ingestion.
7. Preserve sparse exact-scope groups so repeated builds can qualify after
   champion-and-lane combination.

Set the Riot key directly on the Convex deployment. Do not add it to `.env.local`:

```powershell
Set-Clipboard "RGAPI-your-riot-api-key"
Get-Clipboard | npx convex env set RIOT_API_KEY
npx convex env list --names-only
```

The collector is an internal action so an unauthenticated browser cannot spend
the Riot API quota. Trigger `riotCollector.collectPlayerMatches` from a trusted
Convex administrative or scheduled workflow with a PUUID, expected patch,
`EMERALD_PLUS`, a pagination start, and a count from 1 to 20.

For controlled EUW population, run small resumable Challenger batches:

```powershell
$argsJson = "{expectedPatch:'16.13',playerOffset:0,playerCount:2,matchStart:0,matchesPerPlayer:10}"
npx.cmd convex run riotCollector:populateEuwChallenger $argsJson
```

Advance `playerOffset` by the returned `nextPlayerOffset`. Advance
`matchStart` to paginate older games for the same seeds. Keep batches small;
personal Riot keys are rate-limited and the collector deliberately retries
HTTP 429 responses instead of dropping matches.

After deployment, `convex/crons.ts` keeps the EUW dataset current automatically.
Every five minutes it detects the latest Data Dragon `major.minor` patch,
resumes at the next Challenger ladder player, collects that player's 10 latest
Ranked Solo/Duo matches, and re-aggregates only the matchup scopes that changed.
At roughly 300 Challenger players, this revisits the whole ladder about once per
day. The cursor resets when the patch changes and wraps after the last ladder
player. Old-patch records remain patch-isolated and are never used for
current-patch recommendations.

To stay within Convex's free-tier storage budget, a second scheduled job runs
every 30 minutes. It deletes expired recommendation-cache entries and removes
processed-match records, participant samples, and stale derived statistics
older than 21 days. Each table is pruned in batches of at most 500 documents per
run so cleanup remains below Convex transaction limits. This is a rolling
current-patch dataset, not a permanent historical warehouse.

Run the same maintenance action manually when verifying a deployment:

```powershell
npx.cmd convex run datasetMaintenance:refreshEuwDataset
```

Production Convex is separate from development. Set `RIOT_API_KEY` and
`GROQ_API_KEY` on the production Convex deployment, and set
`CONVEX_DEPLOY_KEY` in Vercel. Use Vercel's build command:

```text
npx convex deploy --cmd 'npm run build'
```

Use an approved Riot production key for continuous operation. A temporary
development key expires and will leave the scheduled refresh in `ERROR`.

After samples exist, invoke
`buildAggregation.aggregateExactMatchup` for the exact matchup keys that were
collected. `buildAggregation.getTopExactCandidates` returns the ranked Stage 1
starting and core candidates. Aggregation normalizes starting inventories,
preserves core purchase order, rejects candidates with fewer than five games,
and completely replaces the stored exact-matchup scope.

For temporary dashboard testing, set a separate administration token:

```powershell
Set-Clipboard "generate-a-long-random-token"
Get-Clipboard | npx convex env set STATISTICS_ADMIN_TOKEN
```

The public `statisticsAdmin.aggregateMatchup` action and
`statisticsAdmin.inspectCandidates` query require that token. The public
`statisticsAdmin.inspectResolvedCandidates` action uses the same token and
shows which fallback level the resolver selected. Remove these temporary
endpoints once aggregation is driven by scheduled internal jobs.

Core extraction loads Data Dragon data for the requested match patch and only
keeps completed Summoner's Rift items. Boots, consumables, trinkets, components,
cheap starter items, and unavailable store variants are excluded before samples
are written.

Stage 1 does not reconstruct first recalls. Groq proposes two current-patch
recall options within the selected budget and three situational completed
items. The backend validates their availability, affordability, and uniqueness.
The result labels only starting and core sequences as statistically selected.

Statistical champion identifiers use Riot's numeric champion ID represented as
a string (for example, `"122"` for Darius). The frontend sends Data Dragon's
`Champion.key` for statistical lookup while retaining the textual `Champion.id`
for readable UI and cache identity.

Do not expose `RIOT_API_KEY` to Next.js or the browser. A public deployment also
requires an approved Riot production key and rate-limit/backoff handling.

## Recommendation rules

- Bayesian smoothing reduces small-sample win-rate noise.
- Pick rate and sample confidence contribute to deterministic ranking.
- Playstyle affects explanation and situational advice, not statistical item
  selection.
- Groq cannot return starting or core selections; it can only explain the IDs
  locked by the backend.
- First-recall options that exceed the user's gold budget are rejected.
- The result displays sample size, evidence specificity, and confidence.

LaneForge is not endorsed by Riot Games and does not reflect the views or
opinions of Riot Games or anyone officially involved in producing or managing
Riot Games properties. Riot Games and all associated properties are trademarks
or registered trademarks of Riot Games, Inc.
