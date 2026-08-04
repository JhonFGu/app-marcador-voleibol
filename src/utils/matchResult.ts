export interface SetScoreInput {
  team1Points: number;
  team2Points: number;
}

export interface MatchResultOutput {
  setsWon1: number;
  setsWon2: number;
  winnerId: string | null;
  isComplete: boolean;
}

export function computeMatchResult(
  sets: SetScoreInput[],
  team1Id: string,
  team2Id: string,
  setsToWin: number
): MatchResultOutput {
  let setsWon1 = 0;
  let setsWon2 = 0;

  for (const set of sets) {
    const p1 = Number(set.team1Points);
    const p2 = Number(set.team2Points);
    if (p1 > p2) setsWon1++;
    else if (p2 > p1) setsWon2++;
  }

  const winnerId = setsWon1 >= setsToWin ? team1Id : setsWon2 >= setsToWin ? team2Id : null;
  const isComplete = setsWon1 >= setsToWin || setsWon2 >= setsToWin;

  return { setsWon1, setsWon2, winnerId, isComplete };
}

export function validateSetScore(set: SetScoreInput, isTieBreak: boolean, regularPoints: number, tiebreakPoints: number, overtimeMode: 'con_alargue' | 'a_muerte'): string | null {
  const p1 = Number(set.team1Points);
  const p2 = Number(set.team2Points);

  if (isNaN(p1) || isNaN(p2)) return 'Los puntos deben ser números válidos.';
  if (p1 < 0 || p2 < 0) return 'Los puntos no pueden ser negativos.';
  if (p1 === p2) return 'No puede haber empate en un set.';

  const target = isTieBreak ? tiebreakPoints : regularPoints;
  const maxPoints = Math.max(p1, p2);

  if (maxPoints < target) return `El set debe llegar al menos a ${target} puntos.`;

  if (overtimeMode === 'a_muerte') {
    if (maxPoints !== target) return `En modo "a muerte", el ganador debe tener exactamente ${target} puntos.`;
  } else {
    if (maxPoints - Math.min(p1, p2) < 2) return 'El set debe ganarse por diferencia de al menos 2 puntos.';
  }

  return null;
}
