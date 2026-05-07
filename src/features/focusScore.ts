export interface FocusScoreInput {
  activeTime: number;
  totalTime: number;
  flowTime: number;
  breaks: number;
  idleCount: number;
  breakIntervalMinutes: number;
}

export function calculateBreakHygiene(
  totalTime: number,
  breaks: number,
  breakIntervalMinutes: number
): number {
  const safeInterval = Math.max(1, breakIntervalMinutes);
  const expected = Math.floor(totalTime / (safeInterval * 60));
  if (expected <= 0) return 1;
  if (breaks <= 0) return 0;
  return Math.min(1, breaks / expected);
}

export function calculateFocusScore(input: FocusScoreInput): number {
  const { activeTime, totalTime, flowTime, breaks, idleCount, breakIntervalMinutes } = input;
  if (totalTime <= 0) return 0;

  const activeScore = (activeTime / totalTime) * 40;
  const flowScore = (flowTime / totalTime) * 30;
  const breakHygiene = calculateBreakHygiene(totalTime, breaks, breakIntervalMinutes);
  const breakScore = breakHygiene * 20;
  const idleBonus = idleCount < 3 ? 10 : 0;

  const totalScore = activeScore + flowScore + breakScore + idleBonus;
  return Math.max(0, Math.min(100, Math.round(totalScore)));
}

export function focusScoreColor(score: number): string {
  if (score >= 85) return "#2DD4BF"; // teal
  if (score >= 70) return "#22C55E"; // green
  if (score >= 40) return "#F59E0B"; // amber
  return "#EF4444"; // red
}
