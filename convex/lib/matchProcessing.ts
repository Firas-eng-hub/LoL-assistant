import type {
  RiotMatch,
  RiotMatchParticipant,
  RiotTimeline,
} from "./riotClient";

export type SupportedLane = "TOP" | "JUNGLE" | "MID" | "ADC" | "SUPPORT";

export type MatchBuildSample = {
  matchId: string;
  participantId: number;
  patch: string;
  queueId: number;
  tierGroup: string;
  championId: string;
  opponentChampionId: string;
  lane: SupportedLane;
  win: boolean;
  gameDurationSeconds: number;
  startingItemIds: string[];
  coreItemIds: string[];
};

export function extractPatch(gameVersion: string): string {
  const parts = gameVersion.split(".");

  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(`Invalid game version: ${gameVersion}`);
  }

  return `${parts[0]}.${parts[1]}`;
}

export function mapParticipantLane(
  participant: RiotMatchParticipant,
): SupportedLane | null {
  const position = participant.teamPosition || participant.individualPosition;

  switch (position) {
    case "TOP":
      return "TOP";
    case "JUNGLE":
      return "JUNGLE";
    case "MIDDLE":
      return "MID";
    case "BOTTOM":
      return "ADC";
    case "UTILITY":
      return "SUPPORT";
    default:
      return null;
  }
}

export function findLaneOpponent(
  participant: RiotMatchParticipant,
  participants: RiotMatchParticipant[],
): RiotMatchParticipant | null {
  const lane = mapParticipantLane(participant);

  if (!lane) {
    return null;
  }

  return (
    participants.find(
      (candidate) =>
        candidate.teamId !== participant.teamId &&
        mapParticipantLane(candidate) === lane,
    ) ?? null
  );
}

export function createSamplesFromMatch(
  match: RiotMatch,
  timeline: RiotTimeline,
  input: {
    expectedPatch: string;
    tierGroup: string;
    completedItemIds: Set<string>;
  },
): MatchBuildSample[] {
  if (match.info.queueId !== 420 || match.info.gameDuration < 15 * 60) {
    return [];
  }

  const patch = extractPatch(match.info.gameVersion);

  if (patch !== input.expectedPatch) {
    return [];
  }

  const samples: MatchBuildSample[] = [];

  for (const participant of match.info.participants) {
    const lane = mapParticipantLane(participant);

    if (!lane) {
      continue;
    }

    const opponent = findLaneOpponent(participant, match.info.participants);

    if (!opponent) {
      continue;
    }

    const purchaseHistory = extractPurchaseHistory({
      participantId: participant.participantId,
      timeline,
    });
    const startingItemIds = extractStartingItems(purchaseHistory);
    const coreItemIds = extractCoreItemOrder({
      participant,
      purchaseHistory,
      completedItemIds: input.completedItemIds,
    });

    if (startingItemIds.length === 0 || coreItemIds.length === 0) {
      continue;
    }

    samples.push({
      matchId: match.metadata.matchId,
      participantId: participant.participantId,
      patch,
      queueId: match.info.queueId,
      tierGroup: input.tierGroup,
      championId: String(participant.championId),
      opponentChampionId: String(opponent.championId),
      lane,
      win: participant.win,
      gameDurationSeconds: match.info.gameDuration,
      startingItemIds,
      coreItemIds,
    });
  }

  return samples;
}

type PurchaseRecord = { itemId: string; timestamp: number };

function extractPurchaseHistory(input: {
  participantId: number;
  timeline: RiotTimeline;
}): PurchaseRecord[] {
  const purchases: PurchaseRecord[] = [];

  for (const frame of input.timeline.info.frames) {
    for (const event of frame.events) {
      if (
        event.type !== "ITEM_PURCHASED" ||
        event.participantId !== input.participantId ||
        !event.itemId
      ) {
        continue;
      }

      purchases.push({ itemId: String(event.itemId), timestamp: event.timestamp });
    }
  }

  return purchases.sort((first, second) => first.timestamp - second.timestamp);
}

function extractStartingItems(purchases: PurchaseRecord[]): string[] {
  return purchases
    .filter((purchase) => purchase.timestamp <= 90_000)
    .map((purchase) => purchase.itemId)
    .filter(isRelevantInventoryItem)
    .sort();
}

function extractCoreItemOrder(input: {
  participant: RiotMatchParticipant;
  purchaseHistory: PurchaseRecord[];
  completedItemIds: Set<string>;
}): string[] {
  const finalInventory = new Set(
    [
      input.participant.item0,
      input.participant.item1,
      input.participant.item2,
      input.participant.item3,
      input.participant.item4,
      input.participant.item5,
    ]
      .filter((itemId) => itemId > 0)
      .map(String),
  );
  const orderedFinalPurchases: string[] = [];

  for (const purchase of input.purchaseHistory) {
    if (
      !finalInventory.has(purchase.itemId) ||
      !input.completedItemIds.has(purchase.itemId) ||
      orderedFinalPurchases.includes(purchase.itemId)
    ) {
      continue;
    }

    orderedFinalPurchases.push(purchase.itemId);
  }

  return orderedFinalPurchases.slice(0, 3);
}

function isRelevantInventoryItem(itemId: string): boolean {
  return !new Set(["3340", "3363", "3364"]).has(itemId);
}
