import type { BuildRecommendation } from "@/types/build";
import type { Lane, Playstyle } from "@/types/matchup";

const DATA_DRAGON_VERSION = "15.13.1";

function itemImage(itemId: string): string {
  return (
    `https://ddragon.leagueoflegends.com/cdn/` +
    `${DATA_DRAGON_VERSION}/img/item/${itemId}.png`
  );
}

type CreateMockBuildInput = {
  playerChampionName: string;
  enemyChampionName: string;
  lane: Lane;
  playstyle: Playstyle;
};

export function createMockBuild({
  playerChampionName,
  enemyChampionName,
  lane,
  playstyle,
}: CreateMockBuildInput): BuildRecommendation {
  const playstyleText = {
    SAFE: "This setup prioritizes lane stability and reduces early risk.",
    BALANCED:
      "This setup balances lane pressure, durability, and normal scaling.",
    AGGRESSIVE:
      "This setup prioritizes early pressure and stronger damage purchases.",
  }[playstyle];

  return {
    summary:
      `${playerChampionName} against ${enemyChampionName} in ` +
      `${formatLane(lane)}. ${playstyleText}`,
    matchupTip:
      "Avoid forcing long trades when the opponent has their main cooldowns available. Trade after they use an important ability.",
    startingItems: [
      {
        id: "1056",
        name: "Doran's Ring",
        imageUrl: itemImage("1056"),
        reason: "Provides early ability power, health, and lane sustain.",
      },
      {
        id: "2003",
        name: "Health Potion",
        imageUrl: itemImage("2003"),
        reason: "Provides extra sustain after difficult trades.",
      },
    ],
    firstRecall: [
      {
        title: "Standard recall",
        condition:
          "Choose this when the lane is even and you have a normal amount of gold.",
        items: [
          {
            id: "1001",
            name: "Boots",
            imageUrl: itemImage("1001"),
            reason:
              "Movement speed makes trading and avoiding abilities easier.",
          },
          {
            id: "1052",
            name: "Amplifying Tome",
            imageUrl: itemImage("1052"),
            reason: "Adds early damage and progresses toward your core item.",
          },
        ],
      },
      {
        title: "Defensive recall",
        condition:
          "Choose this when the enemy is pressuring you or winning repeated trades.",
        items: [
          {
            id: "1029",
            name: "Cloth Armor",
            imageUrl: itemImage("1029"),
            reason: "Reduces incoming physical damage during the lane.",
          },
          {
            id: "1001",
            name: "Boots",
            imageUrl: itemImage("1001"),
            reason: "Helps create distance and avoid dangerous engages.",
          },
        ],
      },
    ],
    coreBuild: [
      {
        id: "6657",
        name: "Rod of Ages",
        imageUrl: itemImage("6657"),
        reason: "Provides health, mana, ability power, and scaling.",
      },
      {
        id: "3118",
        name: "Malignance",
        imageUrl: itemImage("3118"),
        reason: "Improves ultimate pressure and sustained magic damage.",
      },
      {
        id: "3157",
        name: "Zhonya's Hourglass",
        imageUrl: itemImage("3157"),
        reason: "Provides defensive utility during dangerous engagements.",
      },
    ],
    situationalItems: [
      {
        item: {
          id: "3165",
          name: "Morellonomicon",
          imageUrl: itemImage("3165"),
          reason: "Adds magic damage and anti-healing utility.",
        },
        condition: "Build this when the enemy team has significant healing.",
      },
      {
        item: {
          id: "3102",
          name: "Banshee's Veil",
          imageUrl: itemImage("3102"),
          reason: "Provides magic resistance and blocks an enemy ability.",
        },
        condition:
          "Build this against dangerous magic damage or important engage abilities.",
      },
      {
        item: {
          id: "3135",
          name: "Void Staff",
          imageUrl: itemImage("3135"),
          reason: "Provides magic penetration against high resistance.",
        },
        condition:
          "Build this when several enemies purchase magic resistance.",
      },
    ],
    evidence: {
      level: "AI_FALLBACK",
      confidence: "LOW",
      sampleSize: 0,
      startingBuildGames: 0,
      coreBuildGames: 0,
      startingRawWinRate: null,
      coreRawWinRate: null,
    },
  };
}

function formatLane(lane: Lane): string {
  const labels: Record<Lane, string> = {
    TOP: "Top",
    JUNGLE: "Jungle",
    MID: "Mid",
    ADC: "ADC",
    SUPPORT: "Support",
  };

  return labels[lane];
}
