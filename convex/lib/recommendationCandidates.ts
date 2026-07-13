export type StatisticalBuildType = "STARTING" | "CORE";

export type EvidenceLevel =
  | "EXACT_MATCHUP_RANKED"
  | "EXACT_MATCHUP_ALL_RANKS"
  | "CHAMPION_LANE_RANKED"
  | "CHAMPION_LANE_ALL_RANKS"
  | "NO_STATISTICAL_DATA";

export type EvidenceConfidence = "LOW" | "MEDIUM" | "HIGH";

export type StatisticalCandidate = {
  orderedItemIds: string[];
  games: number;
  wins: number;
  scopeTotalGames: number;
  rawWinRate: number;
  smoothedWinRate: number;
  pickRate: number;
  confidenceScore: number;
  finalScore: number;
};

export type CandidateResolution = {
  evidenceLevel: EvidenceLevel;
  confidence: EvidenceConfidence;
  sampleSize: number;
  candidateCount: number;
  candidates: StatisticalCandidate[];
};
