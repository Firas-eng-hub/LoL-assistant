export const LANES = ["TOP", "JUNGLE", "MID", "ADC", "SUPPORT"] as const;

export const PLAYSTYLES = ["SAFE", "BALANCED", "AGGRESSIVE"] as const;

export type Lane = (typeof LANES)[number];

export type Playstyle = (typeof PLAYSTYLES)[number];

export type MatchupSelection = {
  playerChampionId: string;
  enemyChampionId: string;
  lane: Lane;
  playstyle: Playstyle;
  firstRecallGold: number;
};
