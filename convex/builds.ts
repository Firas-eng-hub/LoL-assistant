import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action } from "./_generated/server";
import { canAfford } from "./recommendationScoring";
import type {
  CandidateResolution,
  EvidenceConfidence,
  EvidenceLevel,
  StatisticalCandidate,
} from "./lib/recommendationCandidates";

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const DATA_DRAGON_URL = "https://ddragon.leagueoflegends.com";
const GROQ_MODEL = "openai/gpt-oss-120b";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

type Lane = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";
type Playstyle = "SAFE" | "BALANCED" | "AGGRESSIVE";

type RiotItem = {
  name: string;
  description?: string;
  plaintext?: string;
  tags?: string[];
  from?: string[];
  into?: string[];
  depth?: number;
  maps?: Record<string, boolean>;
  gold?: {
    base?: number;
    total?: number;
    sell?: number;
    purchasable?: boolean;
  };
  inStore?: boolean;
};

type CompactItem = {
  id: string;
  name: string;
  price: number;
  tags: string[];
  category: "STARTER" | "BOOTS" | "COMPONENT" | "COMPLETED";
};

type RiotItemsResponse = {
  data: Record<string, RiotItem>;
};

type GroqItemExplanation = {
  id: string;
  reason: string;
};

type GroqRecallOption = {
  title: string;
  condition: string;
  items: GroqItemExplanation[];
};

type GroqSituationalItem = {
  id: string;
  reason: string;
  condition: string;
};

type GroqRecommendation = {
  summary: string;
  matchupTip: string;
  startingReasons: GroqItemExplanation[];
  coreReasons: GroqItemExplanation[];
  firstRecall: GroqRecallOption[];
  situationalItems: GroqSituationalItem[];
};

type ValidatedItem = {
  id: string;
  name: string;
  imageUrl: string;
  reason: string;
};

type BuildRecommendation = {
  summary: string;
  matchupTip: string;
  startingItems: ValidatedItem[];
  firstRecall: Array<{
    title: string;
    condition: string;
    items: ValidatedItem[];
  }>;
  coreBuild: ValidatedItem[];
  situationalItems: Array<{
    item: ValidatedItem;
    condition: string;
  }>;
  evidence: BuildEvidence;
};

type GenerateBuildResult = {
  recommendation: BuildRecommendation;
  source: "cache" | "groq";
  generatedAt: number;
  dataDragonVersion: string;
  evidence: BuildEvidence;
};

type BuildEvidence = {
  level:
    | "EXACT_MATCHUP_RANKED"
    | "EXACT_MATCHUP_ALL_RANKS"
    | "CHAMPION_LANE_RANKED"
    | "CHAMPION_LANE_ALL_RANKS"
    | "AI_FALLBACK";
  sampleSize: number;
  confidence: "LOW" | "MEDIUM" | "HIGH";
  startingBuildGames: number;
  coreBuildGames: number;
  startingRawWinRate: number | null;
  coreRawWinRate: number | null;
};

const buildItemSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    id: { type: "string" },
    reason: { type: "string" },
  },
  required: ["id", "reason"],
} as const;

const buildResponseSchema = {
  name: "lol_build_recommendation",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: { type: "string" },
      matchupTip: { type: "string" },
      startingReasons: {
        type: "array",
        minItems: 0,
        maxItems: 6,
        items: buildItemSchema,
      },
      coreReasons: {
        type: "array",
        minItems: 0,
        maxItems: 3,
        items: buildItemSchema,
      },
      firstRecall: {
        type: "array",
        minItems: 2,
        maxItems: 2,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            condition: { type: "string" },
            items: {
              type: "array",
              minItems: 1,
              maxItems: 3,
              items: buildItemSchema,
            },
          },
          required: ["title", "condition", "items"],
        },
      },
      situationalItems: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            id: { type: "string" },
            reason: { type: "string" },
            condition: { type: "string" },
          },
          required: ["id", "reason", "condition"],
        },
      },
    },
    required: [
      "summary",
      "matchupTip",
      "startingReasons",
      "coreReasons",
      "firstRecall",
      "situationalItems",
    ],
  },
} as const;

export const generateBuild = action({
  args: {
    playerChampionId: v.string(),
    playerChampionKey: v.string(),
    playerChampionName: v.string(),
    playerChampionTags: v.array(v.string()),
    enemyChampionId: v.string(),
    enemyChampionKey: v.string(),
    enemyChampionName: v.string(),
    lane: v.union(
      v.literal("TOP"),
      v.literal("JUNGLE"),
      v.literal("MID"),
      v.literal("ADC"),
      v.literal("SUPPORT"),
    ),
    playstyle: v.union(
      v.literal("SAFE"),
      v.literal("BALANCED"),
      v.literal("AGGRESSIVE"),
    ),
    firstRecallGold: v.number(),
  },

  handler: async (ctx, args): Promise<GenerateBuildResult> => {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error("GROQ_API_KEY is not configured in Convex.");
    }

    validateMatchup(args);
    const playerChampionTags = normalizeChampionTags(
      args.playerChampionTags,
    );

    if (
      !Number.isInteger(args.firstRecallGold) ||
      args.firstRecallGold < 300 ||
      args.firstRecallGold > 5000
    ) {
      throw new Error("First recall gold must be between 300 and 5000.");
    }

    const { version, items } = await loadCurrentItems();
    const matchPatch = normalizePatchVersion(version);
    const evidence = await ctx.runQuery(
      internal.candidateResolver.resolveRecommendationEvidence,
      {
        patch: matchPatch,
        championId: args.playerChampionKey,
        opponentChampionId: args.enemyChampionKey,
        lane: args.lane,
        preferredTierGroup: "EMERALD_PLUS",
      },
    );

    const selectedStartingCandidate = evidence.starting.candidates[0] ?? null;
    const selectedCoreCandidate = evidence.core.candidates[0] ?? null;

    const buildEvidence = createBuildEvidence({
      starting: evidence.starting,
      core: evidence.core,
      selectedStartingCandidate,
      selectedCoreCandidate,
    });
    const evidenceFingerprint = createEvidenceFingerprint(evidence);
    const cacheKey = createCacheKey({
      playerChampionId: args.playerChampionId,
      enemyChampionId: args.enemyChampionId,
      lane: args.lane,
      playstyle: args.playstyle,
      dataDragonVersion: version,
      playerChampionTags,
      firstRecallGold: args.firstRecallGold,
      evidenceFingerprint,
    });
    const currentTime = Date.now();
    const cachedBuild = await ctx.runQuery(
      internal.buildCache.getValidRecommendation,
      {
        cacheKey,
        currentTime,
      },
    );

    if (cachedBuild) {
      return {
        recommendation: cachedBuild.recommendation,
        source: "cache",
        generatedAt: cachedBuild.createdAt,
        dataDragonVersion: version,
        evidence: cachedBuild.evidence,
      };
    }

    const allowedItems = createRelevantItemCatalog({
      items,
      championTags: playerChampionTags,
      lane: args.lane,
    });
    const allowedItemsText = formatItemCatalog(allowedItems);
    const approvedStartingText = formatCandidateForPrompt(
      selectedStartingCandidate,
      items,
    );
    const approvedCoreText = formatCandidateForPrompt(
      selectedCoreCandidate,
      items,
    );

    const prompt = createPrompt({
      playerChampionName: args.playerChampionName,
      playerChampionTags,
      enemyChampionName: args.enemyChampionName,
      lane: args.lane,
      playstyle: args.playstyle,
      patchVersion: version,
      firstRecallGold: args.firstRecallGold,
      allowedItemsText,
      approvedStartingText,
      approvedCoreText,
      startingEvidence: evidence.starting,
      coreEvidence: evidence.core,
      hasStatisticalStartingBuild: selectedStartingCandidate !== null,
      hasStatisticalCoreBuild: selectedCoreCandidate !== null,
    });

    const groqResponse = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a League of Legends item-build explanation assistant. " +
              "Return only a recommendation matching the supplied JSON schema. " +
              "Never change a provided statistical sequence; choose from the supplied catalog only when a sequence is marked NONE. " +
              "Do not invent items, IDs, statistics, or mechanics.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: buildResponseSchema,
        },
      }),
    });

    if (!groqResponse.ok) {
      const errorBody = await groqResponse.text();

      console.error("Groq request failed:", groqResponse.status, errorBody);

      throw new Error(
        `Groq could not generate the build. Status: ${groqResponse.status}`,
      );
    }

    const groqData = (await groqResponse.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
        };
      }>;
    };

    const content = groqData.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("Groq returned an empty recommendation.");
    }

    let generatedBuild: unknown;

    try {
      generatedBuild = JSON.parse(content);
    } catch {
      throw new Error("Groq returned malformed JSON.");
    }

    assertRecommendationShape(generatedBuild);

    const recommendation = createValidatedRecommendation({
      generatedBuild,
      items,
      version,
      approvedStartingIds: selectedStartingCandidate?.orderedItemIds ?? null,
      approvedCoreIds: selectedCoreCandidate?.orderedItemIds ?? null,
      allowedItems,
      firstRecallGold: args.firstRecallGold,
      evidence: buildEvidence,
    });
    const generatedAt = Date.now();

    await ctx.runMutation(internal.buildCache.saveRecommendation, {
      cacheKey,
      playerChampionId: args.playerChampionId,
      enemyChampionId: args.enemyChampionId,
      lane: args.lane,
      playstyle: args.playstyle,
      dataDragonVersion: version,
      recommendation,
      evidence: buildEvidence,
      createdAt: generatedAt,
      expiresAt: generatedAt + CACHE_DURATION_MS,
    });

    return {
      recommendation,
      source: "groq",
      generatedAt,
      dataDragonVersion: version,
      evidence: buildEvidence,
    };
  },
});

function validateMatchup(args: {
  playerChampionId: string;
  playerChampionKey: string;
  playerChampionName: string;
  enemyChampionId: string;
  enemyChampionKey: string;
  enemyChampionName: string;
}) {
  if (args.playerChampionId === args.enemyChampionId) {
    throw new Error("The player and enemy champions must be different.");
  }

  if (!args.playerChampionName.trim() || !args.enemyChampionName.trim()) {
    throw new Error("Both champion names are required.");
  }

  if (
    !/^\d+$/.test(args.playerChampionKey) ||
    !/^\d+$/.test(args.enemyChampionKey)
  ) {
    throw new Error("Champion statistical keys must be numeric.");
  }

  if (args.playerChampionKey === args.enemyChampionKey) {
    throw new Error("The player and enemy champion keys must be different.");
  }
}

async function loadCurrentItems(): Promise<{
  version: string;
  items: Record<string, RiotItem>;
}> {
  const versionsResponse = await fetch(
    `${DATA_DRAGON_URL}/api/versions.json`,
  );

  if (!versionsResponse.ok) {
    throw new Error("Could not retrieve the current Data Dragon version.");
  }

  const versions = (await versionsResponse.json()) as string[];
  const version = versions[0];

  if (!version) {
    throw new Error("Data Dragon returned no versions.");
  }

  const itemsResponse = await fetch(
    `${DATA_DRAGON_URL}/cdn/${version}/data/en_US/item.json`,
  );

  if (!itemsResponse.ok) {
    throw new Error("Could not retrieve current item data.");
  }

  const itemsData = (await itemsResponse.json()) as RiotItemsResponse;
  const validItems = Object.fromEntries(
    Object.entries(itemsData.data).filter(([, item]) => {
      const availableOnSummonersRift = item.maps?.["11"] === true;
      const purchasable = item.gold?.purchasable === true;
      const availableInStore = item.inStore !== false;

      return (
        availableOnSummonersRift &&
        purchasable &&
        availableInStore &&
        Boolean(item.name)
      );
    }),
  );

  return {
    version,
    items: validItems,
  };
}

function normalizeChampionTags(tags: string[]): string[] {
  const canonicalTags = new Map(
    ["Mage", "Fighter", "Tank", "Assassin", "Marksman", "Support"].map(
      (tag) => [tag.toLowerCase(), tag],
    ),
  );
  const normalizedTags = new Set<string>();

  for (const tag of tags) {
    const canonicalTag = canonicalTags.get(tag.trim().toLowerCase());

    if (canonicalTag) {
      normalizedTags.add(canonicalTag);
    }
  }

  if (normalizedTags.size === 0) {
    throw new Error("The player champion has no valid Riot class tags.");
  }

  return [...normalizedTags].sort();
}

export function createRelevantItemCatalog(input: {
  items: Record<string, RiotItem>;
  championTags: string[];
  lane: Lane;
}): CompactItem[] {
  const preferredItemTags = getPreferredItemTags(input.championTags);
  const selectedItems: CompactItem[] = [];

  for (const [id, item] of Object.entries(input.items)) {
    const price = item.gold?.total ?? 0;
    const tags = item.tags ?? [];

    if (!item.name || price <= 0 || shouldExcludeItem(item, tags)) {
      continue;
    }

    const category = classifyItem({ item, tags, price });

    if (!category) {
      continue;
    }

    const isAlwaysIncluded =
      category === "STARTER" ||
      category === "BOOTS" ||
      category === "COMPONENT";
    const matchesChampionClass = tags.some((tag) =>
      preferredItemTags.has(tag),
    );
    const isGenerallyDefensive = tags.some((tag) =>
      ["Health", "Armor", "SpellBlock", "Tenacity"].includes(tag),
    );
    const isJungleRelevant =
      input.lane === "JUNGLE" && tags.includes("Jungle");

    if (
      isAlwaysIncluded ||
      matchesChampionClass ||
      isGenerallyDefensive ||
      isJungleRelevant
    ) {
      selectedItems.push({
        id,
        name: cleanText(item.name),
        price,
        tags,
        category,
      });
    }
  }

  const categoryOrder: Record<CompactItem["category"], number> = {
    STARTER: 0,
    BOOTS: 1,
    COMPONENT: 2,
    COMPLETED: 3,
  };

  return selectedItems
    .sort((firstItem, secondItem) => {
      const categoryDifference =
        categoryOrder[firstItem.category] - categoryOrder[secondItem.category];

      return categoryDifference || firstItem.price - secondItem.price;
    })
    .slice(0, 180);
}

function classifyItem(input: {
  item: RiotItem;
  tags: string[];
  price: number;
}): CompactItem["category"] | null {
  const { item, tags, price } = input;

  if (
    tags.includes("Consumable") ||
    tags.includes("Lane") ||
    tags.includes("Jungle")
  ) {
    return "STARTER";
  }

  if (tags.includes("Boots")) {
    return "BOOTS";
  }

  const buildsIntoAnotherItem = Array.isArray(item.into) && item.into.length > 0;

  if (buildsIntoAnotherItem && price <= 1800) {
    return "COMPONENT";
  }

  const isCompletedItem =
    !buildsIntoAnotherItem ||
    (item.depth !== undefined && item.depth >= 3);

  if (isCompletedItem && price >= 1800) {
    return "COMPLETED";
  }

  return null;
}

function shouldExcludeItem(item: RiotItem, tags: string[]): boolean {
  const normalizedName = item.name.toLowerCase();
  const excludedNameParts = [
    "ornn",
    "masterwork",
    "placeholder",
    "deprecated",
    "prototype",
    "test item",
  ];

  return (
    excludedNameParts.some((part) => normalizedName.includes(part)) ||
    tags.includes("Trinket") ||
    item.gold?.purchasable === false
  );
}

function cleanText(value: string): string {
  return value.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

function getPreferredItemTags(championTags: string[]): Set<string> {
  const selectedTags = new Set<string>([
    "AbilityHaste",
    "CooldownReduction",
  ]);

  for (const championTag of championTags) {
    switch (championTag) {
      case "Mage":
        addTags(selectedTags, [
          "SpellDamage",
          "Mana",
          "ManaRegen",
          "MagicPenetration",
          "Health",
        ]);
        break;
      case "Marksman":
        addTags(selectedTags, [
          "Damage",
          "AttackSpeed",
          "CriticalStrike",
          "LifeSteal",
          "OnHit",
          "ArmorPenetration",
        ]);
        break;
      case "Assassin":
        addTags(selectedTags, [
          "Damage",
          "ArmorPenetration",
          "SpellDamage",
          "MagicPenetration",
          "NonbootsMovement",
        ]);
        break;
      case "Tank":
        addTags(selectedTags, [
          "Health",
          "Armor",
          "SpellBlock",
          "Tenacity",
          "HealthRegen",
        ]);
        break;
      case "Fighter":
        addTags(selectedTags, [
          "Damage",
          "Health",
          "Armor",
          "SpellBlock",
          "LifeSteal",
          "AttackSpeed",
          "OnHit",
        ]);
        break;
      case "Support":
        addTags(selectedTags, [
          "ManaRegen",
          "Health",
          "Armor",
          "SpellBlock",
          "AbilityHaste",
          "Active",
          "Aura",
        ]);
        break;
    }
  }

  return selectedTags;
}

function addTags(target: Set<string>, tags: string[]): void {
  for (const tag of tags) {
    target.add(tag);
  }
}

export function formatItemCatalog(items: CompactItem[]): string {
  const groups: Record<CompactItem["category"], CompactItem[]> = {
    STARTER: [],
    BOOTS: [],
    COMPONENT: [],
    COMPLETED: [],
  };

  for (const item of items) {
    groups[item.category].push(item);
  }

  return [
    formatItemGroup("STARTING AND SPECIAL ITEMS", groups.STARTER),
    formatItemGroup("BOOTS", groups.BOOTS),
    formatItemGroup("COMPONENTS", groups.COMPONENT),
    formatItemGroup("COMPLETED ITEMS", groups.COMPLETED),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatItemGroup(title: string, items: CompactItem[]): string {
  if (items.length === 0) {
    return "";
  }

  const lines = items.map(
    (item) => `${item.id}|${item.name}|${item.price}|${item.tags.join(",")}`,
  );

  return `${title}\n${lines.join("\n")}`;
}

function createPrompt(input: {
  playerChampionName: string;
  playerChampionTags: string[];
  enemyChampionName: string;
  lane: Lane;
  playstyle: Playstyle;
  patchVersion: string;
  firstRecallGold: number;
  allowedItemsText: string;
  approvedStartingText: string;
  approvedCoreText: string;
  startingEvidence: CandidateResolution;
  coreEvidence: CandidateResolution;
  hasStatisticalStartingBuild: boolean;
  hasStatisticalCoreBuild: boolean;
}): string {
  const startingRules = input.hasStatisticalStartingBuild
    ? `- The authoritative starting build was selected by statistical scoring.
- Do not replace, reorder, add, or remove any authoritative starting item.
- Return one concise reason for every distinct authoritative starting item ID.
- If a starting item ID appears more than once, return its reason only once.`
    : `- No statistically supported starting build is available.
- Choose 1 to 3 distinct starting items from the available current-patch catalog.
- The selected starting items must cost no more than 500 gold in total.
- Put the selected IDs and their concise reasons in startingReasons.`;
  const coreRules = input.hasStatisticalCoreBuild
    ? `- The authoritative core build was selected by statistical scoring.
- Do not replace, reorder, add, or remove any authoritative core item.
- Return one concise reason for every authoritative core item.`
    : `- No statistically supported core build is available.
- Choose exactly 3 distinct completed items from the available current-patch catalog.
- Put the selected IDs in purchase order with their concise reasons in coreReasons.`;

  return `
You explain a League of Legends build recommendation.

MATCHUP
Player champion: ${input.playerChampionName}
Champion classes: ${input.playerChampionTags.join(", ")}
Enemy champion: ${input.enemyChampionName}
Lane: ${input.lane}
Playstyle: ${input.playstyle}
First recall budget: ${input.firstRecallGold} gold
Data Dragon version: ${input.patchVersion}

AUTHORITATIVE STARTING BUILD
Format: order|item_id|item_name
${input.approvedStartingText}

STARTING EVIDENCE
Level: ${input.startingEvidence.evidenceLevel}
Sample size: ${input.startingEvidence.sampleSize}
Confidence: ${input.startingEvidence.confidence}

AUTHORITATIVE CORE BUILD
Format: order|item_id|item_name
${input.approvedCoreText}

CORE EVIDENCE
Level: ${input.coreEvidence.evidenceLevel}
Sample size: ${input.coreEvidence.sampleSize}
Confidence: ${input.coreEvidence.confidence}

MANDATORY RULES
${startingRules}
${coreRules}
- For statistically locked sections, every reason ID must exactly match an authoritative item ID.
- Do not claim that correlation proves an item caused the wins.
- Explain why the sequence is reasonable for this matchup.
- Use the playstyle to shape wording and situational advice, not to replace authoritative items.
- Provide exactly two different first-recall options, each costing at most ${input.firstRecallGold} gold.
- Provide exactly three different situational completed items.
- First-recall and situational IDs must come from the available current-patch catalog.
- Do not invent items, IDs, statistics, sample sizes, win rates, or mechanics.
- Keep all explanations concise.

AVAILABLE ITEMS FOR FIRST RECALL AND SITUATIONAL CHOICES
Format: item_id|item_name|total_gold|tags
${input.allowedItemsText}
`.trim();
}

function assertRecommendationShape(
  value: unknown,
): asserts value is GroqRecommendation {
  if (!isObject(value)) {
    throw new Error("The recommendation is not an object.");
  }

  assertString(value.summary, "summary");
  assertString(value.matchupTip, "matchupTip");
  assertBuildItemArray(value.startingReasons, "startingReasons", 0, 6);
  assertBuildItemArray(value.coreReasons, "coreReasons", 0, 3);

  if (!Array.isArray(value.firstRecall) || value.firstRecall.length !== 2) {
    throw new Error("firstRecall must contain exactly two options.");
  }

  for (const option of value.firstRecall) {
    if (!isObject(option)) {
      throw new Error("A first-recall option is invalid.");
    }

    assertString(option.title, "firstRecall.title");
    assertString(option.condition, "firstRecall.condition");
    assertBuildItemArray(option.items, "firstRecall.items", 1, 3);
  }

  if (
    !Array.isArray(value.situationalItems) ||
    value.situationalItems.length !== 3
  ) {
    throw new Error("situationalItems must contain exactly three items.");
  }

  for (const entry of value.situationalItems) {
    if (!isObject(entry)) {
      throw new Error("A situational item is invalid.");
    }

    assertString(entry.id, "situationalItems.id");
    assertString(entry.reason, "situationalItems.reason");
    assertString(entry.condition, "situationalItems.condition");
  }
}

function assertBuildItemArray(
  value: unknown,
  fieldName: string,
  minimum: number,
  maximum: number,
) {
  if (
    !Array.isArray(value) ||
    value.length < minimum ||
    value.length > maximum
  ) {
    throw new Error(`${fieldName} contains an invalid number of items.`);
  }

  for (const entry of value) {
    if (!isObject(entry)) {
      throw new Error(`${fieldName} contains an invalid item.`);
    }

    assertString(entry.id, `${fieldName}.id`);
    assertString(entry.reason, `${fieldName}.reason`);
  }
}

function createValidatedRecommendation(input: {
  generatedBuild: GroqRecommendation;
  items: Record<string, RiotItem>;
  version: string;
  approvedStartingIds: string[] | null;
  approvedCoreIds: string[] | null;
  allowedItems: CompactItem[];
  firstRecallGold: number;
  evidence: BuildEvidence;
}): BuildRecommendation {
  const allowedItemsById = new Map(
    input.allowedItems.map((item) => [item.id, item]),
  );
  const startingSelection = resolveSectionSelection({
    explanations: input.generatedBuild.startingReasons,
    approvedIds: input.approvedStartingIds,
    fieldName: "startingReasons",
    kind: "STARTING",
    allowedItemsById,
    items: input.items,
  });
  const coreSelection = resolveSectionSelection({
    explanations: input.generatedBuild.coreReasons,
    approvedIds: input.approvedCoreIds,
    fieldName: "coreReasons",
    kind: "CORE",
    allowedItemsById,
    items: input.items,
  });

  for (const itemId of coreSelection.itemIds) {
    const item = input.items[itemId];

    if (!item || !isCompletedBuildItem(item)) {
      throw new Error(`Approved core item is not completed: ${itemId}`);
    }
  }

  return {
    summary: input.generatedBuild.summary.trim(),
    matchupTip: input.generatedBuild.matchupTip.trim(),
    startingItems: enrichApprovedItems({
      itemIds: startingSelection.itemIds,
      reasons: startingSelection.reasons,
      items: input.items,
      version: input.version,
    }),
    firstRecall: enrichFirstRecall({
      options: input.generatedBuild.firstRecall,
      items: input.items,
      version: input.version,
      allowedItemIds: new Set(allowedItemsById.keys()),
      firstRecallGold: input.firstRecallGold,
    }),
    coreBuild: enrichApprovedItems({
      itemIds: coreSelection.itemIds,
      reasons: coreSelection.reasons,
      items: input.items,
      version: input.version,
    }),
    situationalItems: enrichSituationalItems({
      entries: input.generatedBuild.situationalItems,
      items: input.items,
      version: input.version,
      allowedItemIds: new Set(allowedItemsById.keys()),
      disallowedItemIds: new Set(coreSelection.itemIds),
    }),
    evidence: input.evidence,
  };
}

function resolveSectionSelection(input: {
  explanations: GroqItemExplanation[];
  approvedIds: string[] | null;
  fieldName: string;
  kind: "STARTING" | "CORE";
  allowedItemsById: Map<string, CompactItem>;
  items: Record<string, RiotItem>;
}): { itemIds: string[]; reasons: Map<string, string> } {
  if (input.approvedIds) {
    return {
      itemIds: input.approvedIds,
      reasons: validateExplanationIds({
        explanations: input.explanations,
        approvedIds: input.approvedIds,
        fieldName: input.fieldName,
      }),
    };
  }

  const expectedCountIsValid =
    input.kind === "STARTING"
      ? input.explanations.length >= 1 && input.explanations.length <= 3
      : input.explanations.length === 3;

  if (!expectedCountIsValid) {
    throw new Error(
      input.kind === "STARTING"
        ? "AI fallback must choose between one and three starting items."
        : "AI fallback must choose exactly three core items.",
    );
  }

  const itemIds = input.explanations.map((explanation) => explanation.id);
  const reasons = new Map<string, string>();

  if (new Set(itemIds).size !== itemIds.length) {
    throw new Error(`AI fallback returned duplicate ${input.kind.toLowerCase()} items.`);
  }

  for (const explanation of input.explanations) {
    const catalogItem = input.allowedItemsById.get(explanation.id);
    const riotItem = input.items[explanation.id];

    if (!catalogItem || !riotItem) {
      throw new Error(
        `AI fallback returned an unavailable item ID: ${explanation.id}`,
      );
    }

    if (input.kind === "CORE" && catalogItem.category !== "COMPLETED") {
      throw new Error(`AI fallback core item is not completed: ${explanation.id}`);
    }

    const reason = explanation.reason.trim();

    if (!reason) {
      throw new Error(`${input.fieldName} contains an empty reason.`);
    }

    reasons.set(explanation.id, reason);
  }

  if (
    input.kind === "STARTING" &&
    !canAfford(itemIds, 500, input.items)
  ) {
    throw new Error("AI fallback starting items exceed the 500 gold budget.");
  }

  return { itemIds, reasons };
}

function validateExplanationIds(input: {
  explanations: GroqItemExplanation[];
  approvedIds: string[];
  fieldName: string;
}): Map<string, string> {
  const approvedSet = new Set(input.approvedIds);

  if (input.explanations.length !== approvedSet.size) {
    throw new Error(
      `${input.fieldName} must explain every distinct approved item ID exactly once.`,
    );
  }

  const reasons = new Map<string, string>();

  for (const explanation of input.explanations) {
    if (!approvedSet.has(explanation.id)) {
      throw new Error(
        `${input.fieldName} contains an unapproved item ID: ${explanation.id}`,
      );
    }

    if (reasons.has(explanation.id)) {
      throw new Error(
        `${input.fieldName} contains a duplicate item ID: ${explanation.id}`,
      );
    }

    const reason = explanation.reason.trim();

    if (!reason) {
      throw new Error(`${input.fieldName} contains an empty reason.`);
    }

    reasons.set(explanation.id, reason);
  }

  return reasons;
}

function enrichApprovedItems(input: {
  itemIds: string[];
  reasons: Map<string, string>;
  items: Record<string, RiotItem>;
  version: string;
}): ValidatedItem[] {
  return input.itemIds.map((itemId) => {
    const item = input.items[itemId];
    const reason = input.reasons.get(itemId);

    if (!item) {
      throw new Error(
        `Approved item ${itemId} is unavailable on patch ${input.version}.`,
      );
    }

    if (!reason) {
      throw new Error(`No explanation was returned for approved item ${itemId}.`);
    }

    return enrichItem({ id: itemId, reason }, input.items, input.version);
  });
}

function enrichFirstRecall(input: {
  options: GroqRecallOption[];
  items: Record<string, RiotItem>;
  version: string;
  allowedItemIds: Set<string>;
  firstRecallGold: number;
}): BuildRecommendation["firstRecall"] {
  const sequences = new Set<string>();

  const options = input.options.map((option) => {
    const itemIds = option.items.map((item) => item.id);

    if (
      new Set(itemIds).size !== itemIds.length ||
      itemIds.some((itemId) => !input.allowedItemIds.has(itemId))
    ) {
      throw new Error("A first-recall option contains an unavailable item.");
    }

    if (!canAfford(itemIds, input.firstRecallGold, input.items)) {
      throw new Error("A first-recall option exceeds the available gold.");
    }

    sequences.add(sequenceKey(itemIds));

    return {
      title: option.title.trim(),
      condition: option.condition.trim(),
      items: option.items.map((item) =>
        enrichItem(item, input.items, input.version),
      ),
    };
  });

  if (sequences.size !== options.length) {
    throw new Error("The first-recall options must be different.");
  }

  return options;
}

function enrichSituationalItems(input: {
  entries: GroqSituationalItem[];
  items: Record<string, RiotItem>;
  version: string;
  allowedItemIds: Set<string>;
  disallowedItemIds: Set<string>;
}): BuildRecommendation["situationalItems"] {
  const selectedIds = new Set<string>();

  return input.entries.map((entry) => {
    const item = input.items[entry.id];

    if (
      selectedIds.has(entry.id) ||
      input.disallowedItemIds.has(entry.id) ||
      !input.allowedItemIds.has(entry.id) ||
      !item ||
      !isFinishedSituationalItem(item)
    ) {
      throw new Error(
        `Situational item is not an approved distinct completed item: ${entry.id}`,
      );
    }

    selectedIds.add(entry.id);

    return {
      item: enrichItem(entry, input.items, input.version),
      condition: entry.condition.trim(),
    };
  });
}

function isFinishedSituationalItem(item: RiotItem): boolean {
  return isCompletedBuildItem(item) || item.tags?.includes("Boots") === true;
}

function enrichItem(
  item: GroqItemExplanation,
  items: Record<string, RiotItem>,
  version: string,
): ValidatedItem {
  const riotItem = items[item.id];

  if (!riotItem) {
    throw new Error(`Groq returned an unavailable item ID: ${item.id}`);
  }

  return {
    id: item.id,
    name: cleanText(riotItem.name),
    imageUrl: `${DATA_DRAGON_URL}/cdn/${version}/img/item/${item.id}.png`,
    reason: item.reason.trim(),
  };
}

function sequenceKey(itemIds: string[]): string {
  return itemIds.join(">");
}

function isCompletedBuildItem(item: RiotItem): boolean {
  const price = item.gold?.total ?? 0;
  const buildsIntoAnotherItem = Array.isArray(item.into) && item.into.length > 0;

  return (
    !buildsIntoAnotherItem &&
    price >= 1800 &&
    !item.tags?.includes("Consumable") &&
    !item.tags?.includes("Trinket")
  );
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertString(
  value: unknown,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${fieldName} must be a non-empty string.`);
  }
}

function normalizePatchVersion(dataDragonVersion: string): string {
  const parts = dataDragonVersion.split(".");

  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid Data Dragon version: ${dataDragonVersion}`);
  }

  return `${parts[0]}.${parts[1]}`;
}

function formatCandidateForPrompt(
  candidate: StatisticalCandidate | null,
  items: Record<string, RiotItem>,
): string {
  if (!candidate) {
    return "NONE";
  }

  return candidate.orderedItemIds
    .map((itemId, index) => {
      const item = items[itemId];

      if (!item) {
        throw new Error(
          `Approved statistical item ${itemId} is unavailable on the current patch.`,
        );
      }

      return [index + 1, itemId, cleanText(item.name)].join("|");
    })
    .join("\n");
}

function createEvidenceFingerprint(evidence: {
  starting: CandidateResolution;
  core: CandidateResolution;
}): string {
  const formatCandidates = (resolution: CandidateResolution) =>
    resolution.candidates
      .map(
        (candidate) =>
          `${candidate.orderedItemIds.join("-")}` +
          `@${candidate.games}` +
          `@${candidate.wins}` +
          `@${candidate.scopeTotalGames}` +
          `@${candidate.finalScore}`,
      )
      .join(",");

  return [
    evidence.starting.evidenceLevel,
    evidence.starting.confidence,
    evidence.starting.sampleSize,
    evidence.core.evidenceLevel,
    evidence.core.confidence,
    evidence.core.sampleSize,
    formatCandidates(evidence.starting),
    formatCandidates(evidence.core),
  ].join("|");
}

function createBuildEvidence(input: {
  starting: CandidateResolution;
  core: CandidateResolution;
  selectedStartingCandidate: StatisticalCandidate | null;
  selectedCoreCandidate: StatisticalCandidate | null;
}): BuildEvidence {
  return {
    level: mapEvidenceLevel(
      input.starting.evidenceLevel,
      input.core.evidenceLevel,
    ),
    confidence: weakerConfidence(
      input.starting.confidence,
      input.core.confidence,
    ),
    sampleSize: Math.min(input.starting.sampleSize, input.core.sampleSize),
    startingBuildGames: input.selectedStartingCandidate?.games ?? 0,
    coreBuildGames: input.selectedCoreCandidate?.games ?? 0,
    startingRawWinRate: input.selectedStartingCandidate?.rawWinRate ?? null,
    coreRawWinRate: input.selectedCoreCandidate?.rawWinRate ?? null,
  };
}

function mapEvidenceLevel(
  startingLevel: EvidenceLevel,
  coreLevel: EvidenceLevel,
): BuildEvidence["level"] {
  const priority: BuildEvidence["level"][] = [
    "EXACT_MATCHUP_RANKED",
    "EXACT_MATCHUP_ALL_RANKS",
    "CHAMPION_LANE_RANKED",
    "CHAMPION_LANE_ALL_RANKS",
    "AI_FALLBACK",
  ];
  const normalize = (level: EvidenceLevel): BuildEvidence["level"] =>
    level === "NO_STATISTICAL_DATA" ? "AI_FALLBACK" : level;

  return priority[
    Math.max(
      priority.indexOf(normalize(startingLevel)),
      priority.indexOf(normalize(coreLevel)),
    )
  ];
}

function weakerConfidence(
  first: EvidenceConfidence,
  second: EvidenceConfidence,
): EvidenceConfidence {
  const order: EvidenceConfidence[] = ["LOW", "MEDIUM", "HIGH"];

  return order[Math.min(order.indexOf(first), order.indexOf(second))];
}

function createCacheKey(input: {
  playerChampionId: string;
  enemyChampionId: string;
  lane: Lane;
  playstyle: Playstyle;
  dataDragonVersion: string;
  playerChampionTags: string[];
  firstRecallGold: number;
  evidenceFingerprint: string;
}): string {
  return [
    "stage1-v1",
    input.dataDragonVersion,
    input.playerChampionId,
    input.enemyChampionId,
    input.lane,
    input.playstyle,
    input.playerChampionTags.join(","),
    input.firstRecallGold,
    input.evidenceFingerprint,
  ]
    .map((value) => String(value).trim().toLowerCase())
    .join(":");
}
