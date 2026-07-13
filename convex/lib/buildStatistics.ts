export type BuildStatisticsInput = {
  wins: number;
  games: number;
  totalMatchupGames: number;
  baselineWinRate: number;
  priorWeight?: number;
  confidenceTarget?: number;
};

export type BuildStatisticsResult = {
  rawWinRate: number;
  smoothedWinRate: number;
  pickRate: number;
  confidenceScore: number;
  finalScore: number;
};

export function calculateBuildStatistics(
  input: BuildStatisticsInput,
): BuildStatisticsResult {
  if (input.games <= 0) {
    throw new Error("games must be greater than zero.");
  }

  if (input.wins < 0 || input.wins > input.games) {
    throw new Error("wins must be between zero and games.");
  }

  const baselineWinRate = clamp(input.baselineWinRate, 0, 1);
  const priorWeight = input.priorWeight ?? 100;
  const confidenceTarget = input.confidenceTarget ?? 300;

  if (priorWeight < 0 || confidenceTarget <= 0) {
    throw new Error("Statistical weights must be positive.");
  }

  const rawWinRate = input.wins / input.games;
  const smoothedWinRate =
    (input.wins + priorWeight * baselineWinRate) /
    (input.games + priorWeight);
  const pickRate =
    input.totalMatchupGames > 0
      ? input.games / input.totalMatchupGames
      : 0;
  const confidenceScore =
    input.games / (input.games + confidenceTarget);
  const popularityScore = Math.sqrt(clamp(pickRate, 0, 1));
  const finalScore =
    0.65 * smoothedWinRate +
    0.2 * confidenceScore +
    0.15 * popularityScore;

  return {
    rawWinRate,
    smoothedWinRate,
    pickRate,
    confidenceScore,
    finalScore,
  };
}

export function getConfidenceLabel(
  games: number,
): "LOW" | "MEDIUM" | "HIGH" {
  if (games >= 300) {
    return "HIGH";
  }

  if (games >= 100) {
    return "MEDIUM";
  }

  return "LOW";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
