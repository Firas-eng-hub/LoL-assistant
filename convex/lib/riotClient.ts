const PLATFORM_BASE_URL = "https://euw1.api.riotgames.com";
const REGIONAL_BASE_URL = "https://europe.api.riotgames.com";
const MAX_RETRIES = 3;

export type RiotMatchParticipant = {
  participantId: number;
  puuid: string;
  championId: number;
  championName: string;
  teamId: number;
  teamPosition: string;
  individualPosition: string;
  win: boolean;
  item0: number;
  item1: number;
  item2: number;
  item3: number;
  item4: number;
  item5: number;
  item6: number;
};

export type RiotMatch = {
  metadata: {
    matchId: string;
    participants: string[];
  };
  info: {
    gameCreation: number;
    gameDuration: number;
    gameEndTimestamp?: number;
    gameMode: string;
    gameType: string;
    gameVersion: string;
    queueId: number;
    participants: RiotMatchParticipant[];
  };
};

export type RiotTimelineEvent = {
  type: string;
  timestamp: number;
  participantId?: number;
  itemId?: number;
  beforeId?: number;
  afterId?: number;
  goldGain?: number;
};

export type RiotTimeline = {
  metadata: { matchId: string };
  info: {
    frames: Array<{
      timestamp: number;
      events: RiotTimelineEvent[];
    }>;
  };
};

type RiotLeagueList = {
  entries?: Array<{
    puuid?: string;
  }>;
};

export async function getEuwChallengerPuuids(): Promise<string[]> {
  const league = await riotFetch<RiotLeagueList>(
    `${PLATFORM_BASE_URL}/lol/league/v4/challengerleagues/by-queue/` +
      "RANKED_SOLO_5x5",
  );
  const puuids = (league.entries ?? [])
    .map((entry) => entry.puuid?.trim())
    .filter((puuid): puuid is string => Boolean(puuid));

  if (puuids.length === 0) {
    throw new Error("The EUW Challenger ladder returned no PUUIDs.");
  }

  return [...new Set(puuids)];
}

export async function getMatchIdsByPuuid(
  puuid: string,
  input?: {
    start?: number;
    count?: number;
    queue?: number;
    startTime?: number;
  },
): Promise<string[]> {
  const parameters = new URLSearchParams({
    start: String(input?.start ?? 0),
    count: String(input?.count ?? 20),
    queue: String(input?.queue ?? 420),
  });

  if (input?.startTime !== undefined) {
    parameters.set("startTime", String(input.startTime));
  }

  return riotFetch<string[]>(
    `${REGIONAL_BASE_URL}/lol/match/v5/matches/by-puuid/` +
      `${encodeURIComponent(puuid)}/ids?${parameters.toString()}`,
  );
}

export async function getMatch(matchId: string): Promise<RiotMatch> {
  return riotFetch<RiotMatch>(
    `${REGIONAL_BASE_URL}/lol/match/v5/matches/${encodeURIComponent(matchId)}`,
  );
}

export async function getTimeline(matchId: string): Promise<RiotTimeline> {
  return riotFetch<RiotTimeline>(
    `${REGIONAL_BASE_URL}/lol/match/v5/matches/` +
      `${encodeURIComponent(matchId)}/timeline`,
  );
}

export function getPlatformBaseUrl(): string {
  return PLATFORM_BASE_URL;
}

async function riotFetch<T>(url: string): Promise<T> {
  const apiKey = process.env.RIOT_API_KEY;

  if (!apiKey) {
    throw new Error("RIOT_API_KEY is not configured.");
  }

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "X-Riot-Token": apiKey,
        Accept: "application/json",
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    if (response.status === 429) {
      if (attempt === MAX_RETRIES) {
        throw new Error("Riot API rate limit exceeded.");
      }

      const retryAfter = Number(response.headers.get("Retry-After"));
      const retryAfterSeconds =
        Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : 1;
      await sleep(retryAfterSeconds * 1000);
      continue;
    }

    if (response.status >= 500 && attempt < MAX_RETRIES) {
      await sleep(500 * 2 ** attempt);
      continue;
    }

    const body = await response.text();

    throw new Error(
      `Riot API request failed with ${response.status}: ${body.slice(0, 300)}`,
    );
  }

  throw new Error("Riot API request failed after retries.");
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}
