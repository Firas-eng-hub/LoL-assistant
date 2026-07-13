export type BuildItem = {
  id: string;
  name: string;
  imageUrl: string;
  reason: string;
};

export type RecallOption = {
  title: string;
  condition: string;
  items: BuildItem[];
};

export type SituationalItem = {
  item: BuildItem;
  condition: string;
};

export type EvidenceLevel =
  | "EXACT_MATCHUP_RANKED"
  | "EXACT_MATCHUP_ALL_RANKS"
  | "CHAMPION_LANE_RANKED"
  | "CHAMPION_LANE_ALL_RANKS"
  | "AI_FALLBACK";

export type EvidenceConfidence = "LOW" | "MEDIUM" | "HIGH";

export type BuildEvidence = {
  level: EvidenceLevel;
  confidence: EvidenceConfidence;
  sampleSize: number;
  startingBuildGames: number;
  coreBuildGames: number;
  startingRawWinRate: number | null;
  coreRawWinRate: number | null;
};

export type BuildRecommendation = {
  summary: string;
  matchupTip: string;
  startingItems: BuildItem[];
  firstRecall: RecallOption[];
  coreBuild: BuildItem[];
  situationalItems: SituationalItem[];
  evidence: BuildEvidence;
};
