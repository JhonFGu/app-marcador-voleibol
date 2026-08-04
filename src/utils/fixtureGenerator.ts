export interface GeneratedMatch {
  tournament_id: string;
  team1_id: string;
  team2_id: string;
  court: number;
  status: 'pending' | 'in_progress' | 'finished';
  score_json: any;
  match_type: 'league' | 'group' | 'knockout';
  group_name?: string;
  round: number;
  knockout_round?: string;
  scheduled_time?: string;
}

export interface KnockoutQualifier {
  teamId: string;
  teamName: string;
  label: string;
}

export interface StandingRowSimple {
  teamId: string;
  teamName: string;
  points: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}

export interface BestThird {
  teamId: string;
  teamName: string;
  rank: number;
  groupLetter: string;
}

export type TiebreakCriterion = 'points' | 'wins' | 'set_ratio' | 'point_diff' | 'point_ratio' | 'head_to_head' | 'team_name';

export const TIEBREAK_CRITERIA: {
  key: TiebreakCriterion;
  label: string;
  description: string;
  removable: boolean;
}[] = [
  { key: 'points',       label: 'Puntos en la tabla',  description: 'Sistema 3-2-1-0',      removable: false },
  { key: 'wins',         label: 'Partidos ganados',    description: 'Más PG gana',           removable: true  },
  { key: 'set_ratio',    label: 'Coef. de sets',       description: 'Sets a favor / Sets en contra', removable: true  },
  { key: 'point_diff',   label: 'Diferencia de puntos',description: 'PA - PR',               removable: true  },
  { key: 'point_ratio',  label: 'Coef. de puntos',     description: 'PA / PR',               removable: true  },
  { key: 'head_to_head', label: 'Duelo directo',       description: 'Entre equipos empatados', removable: true  },
  { key: 'team_name',    label: 'Orden alfabético',    description: 'Último recurso',        removable: false },
];

export const DEFAULT_TIEBREAK_CRITERIA: TiebreakCriterion[] = [
  'points', 'wins', 'set_ratio', 'point_diff', 'point_ratio', 'head_to_head', 'team_name',
];

export interface StandingRowLike {
  teamId: string;
  teamName: string;
  points: number;
  won?: number;
  played?: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}

export interface MatchRef {
  team1_id: string;
  team2_id: string;
  score_json?: { winner_id?: string | null; sets?: any[] } | any;
  match_type?: string;
}

/**
 * Generates matches using the Berger round-robin algorithm.
 */
export function generateRoundRobin(
  teamIds: string[],
  tournamentId: string,
  courtCount: number,
  matchType: 'league' | 'group' = 'league',
  groupName?: string,
  assignedCourt?: number
): GeneratedMatch[] {
  const teams = [...teamIds];
  
  if (teams.length < 2) return [];

  const hasBye = teams.length % 2 !== 0;
  if (hasBye) {
    teams.push('BYE');
  }

  const numTeams = teams.length;
  const numRounds = numTeams - 1;
  const matchesPerRound = numTeams / 2;
  const matches: GeneratedMatch[] = [];

  let courtIndex = 1;

  for (let round = 0; round < numRounds; round++) {
    for (let i = 0; i < matchesPerRound; i++) {
      let home = teams[(round + i) % (numTeams - 1)];
      let away = teams[(round - i + numTeams - 1) % (numTeams - 1)];

      if (i === 0) {
        away = teams[numTeams - 1];
      }

      if (home !== 'BYE' && away !== 'BYE') {
        const isHome = round % 2 === 0;
        matches.push({
          tournament_id: tournamentId,
          team1_id: isHome ? home : away,
          team2_id: isHome ? away : home,
          court: assignedCourt !== undefined ? assignedCourt : courtIndex,
          status: 'pending',
          score_json: { sets: [], winner_id: null },
          match_type: matchType,
          group_name: groupName,
          round: round + 1,
        });

        courtIndex = (courtIndex % courtCount) + 1;
      }
    }
  }

  return matches;
}

/**
 * Splits teams into groups and generates round-robin fixtures for each group.
 */
export function generateGroupFixtures(
  teamIds: string[],
  tournamentId: string,
  courtCount: number,
  groupCount: number,
  manualGroups?: { [groupLetter: string]: string[] },
  manualGroupsCourts?: { [groupLetter: string]: number }
): GeneratedMatch[] {
  if (teamIds.length < groupCount * 2 && !manualGroups) return [];

  const groups: { [key: string]: string[] } = {};
  const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  if (manualGroups) {
    Object.entries(manualGroups).forEach(([letter, ids]) => {
      groups[letter] = ids;
    });
  } else {
    for (let i = 0; i < groupCount; i++) {
      groups[alph[i]] = [];
    }

    teamIds.forEach((teamId, index) => {
      const groupLetter = alph[index % groupCount];
      groups[groupLetter].push(teamId);
    });
  }

  let allMatches: GeneratedMatch[] = [];
  
  Object.entries(groups).forEach(([groupName, groupTeamIds], groupIndex) => {
    let assignedCourt: number | undefined = undefined;
    if (manualGroupsCourts && manualGroupsCourts[groupName] !== undefined) {
      assignedCourt = manualGroupsCourts[groupName];
    } else if (groupCount === courtCount) {
      assignedCourt = (groupIndex % courtCount) + 1;
    }

    const groupMatches = generateRoundRobin(
      groupTeamIds,
      tournamentId,
      courtCount,
      'group',
      `Grupo ${groupName}`,
      assignedCourt
    );
    allMatches = [...allMatches, ...groupMatches];
  });

  return allMatches;
}

function getKnockoutRoundName(round: number, totalRounds: number): string {
  const names = ['', 'Final', 'Semifinales', 'Cuartos', 'Octavos'];
  const idx = totalRounds - round + 1;
  return names[idx] || `Ronda Eliminatoria ${round}`;
}

/**
 * Generates the first round of a single-elimination knockout bracket.
 * Returns only round 1 matches (teams are known).
 * Subsequent rounds are generated lazily via generateNextKnockoutRound().
 *
 * Seeding order: interleaved [1A, 2A, 1B, 2B, ...] + best thirds at end.
 * Bracket pairing: seed[i] vs seed[N-1-i] avoids same-group collisions for even groups.
 */
export function generateKnockoutBracket(
  qualifiedTeams: KnockoutQualifier[],
  tournamentId: string,
  courtCount: number,
  totalRounds: number
): GeneratedMatch[] {
  const N = qualifiedTeams.length;
  if (N < 2 || (N & (N - 1)) !== 0) {
    throw new Error('Qualified teams count must be a power of 2 and at least 2');
  }

  const matches: GeneratedMatch[] = [];

  for (let i = 0; i < N / 2; i++) {
    const teamA = qualifiedTeams[i];
    const teamB = qualifiedTeams[N - 1 - i];

    matches.push({
      tournament_id: tournamentId,
      team1_id: teamA.teamId,
      team2_id: teamB.teamId,
      court: (i % courtCount) + 1,
      status: 'pending',
      score_json: { sets: [], winner_id: null },
      match_type: 'knockout',
      round: 1,
      knockout_round: getKnockoutRoundName(1, totalRounds),
    });
  }

  return matches;
}

/**
 * Generates the next knockout round by pairing winners of the previous round.
 * Pairing: match[2*i].winner vs match[2*i+1].winner
 */
export function generateNextKnockoutRound(
  tournamentId: string,
  previousRoundMatches: { score_json?: any }[],
  courtCount: number,
  totalRounds: number,
  nextRound: number
): GeneratedMatch[] {
  if (previousRoundMatches.length < 2) return [];

  const matches: GeneratedMatch[] = [];
  const winners: (string | null)[] = [];

  for (const m of previousRoundMatches) {
    const score = m.score_json || {};
    winners.push(score.winner_id || null);
  }

  if (winners.some(w => w === null)) {
    return [];
  }

  for (let i = 0; i < winners.length; i += 2) {
    if (i + 1 >= winners.length) break;
    matches.push({
      tournament_id: tournamentId,
      team1_id: winners[i]!,
      team2_id: winners[i + 1]!,
      court: ((i / 2) % courtCount) + 1,
      status: 'pending',
      score_json: { sets: [], winner_id: null },
      match_type: 'knockout',
      round: nextRound,
      knockout_round: getKnockoutRoundName(nextRound, totalRounds),
    });
  }

  return matches;
}

/**
 * Builds the ordered list of knockout qualifiers for bracket seeding.
 * interleave = true puts winners and runners-up in interleaved order
 * [1A, 2A, 1B, 2B, ...] to avoid same-group collisions in early rounds.
 */
export function buildKnockoutQualifiers(
  groupWinners: KnockoutQualifier[],
  groupRunnersUp: KnockoutQualifier[],
  groupThirds: KnockoutQualifier[],
  bestThirds: BestThird[]
): KnockoutQualifier[] {
  const interleaved: KnockoutQualifier[] = [];
  const maxLen = Math.max(groupWinners.length, groupRunnersUp.length);

  for (let i = 0; i < maxLen; i++) {
    if (i < groupWinners.length) {
      interleaved.push(groupWinners[i]);
    }
    if (i < groupRunnersUp.length) {
      interleaved.push(groupRunnersUp[i]);
    }
  }

  for (const t of groupThirds) {
    interleaved.push(t);
  }

  for (const bt of bestThirds) {
    interleaved.push({
      teamId: bt.teamId,
      teamName: bt.teamName,
      label: bt.rank === 1 ? 'Mejor 3ro' : `Mejor 3ro #${bt.rank}`,
    });
  }

  return interleaved;
}

/**
 * Normalizes stored tiebreak criteria, ensuring 'points' is first and 'team_name' is last.
 * Filters out unknown keys and auto-completes missing required keys.
 */
export function normalizeTiebreakCriteria(stored: any): TiebreakCriterion[] {
  const validKeys = new Set(TIEBREAK_CRITERIA.map(c => c.key));
  if (!Array.isArray(stored)) return [...DEFAULT_TIEBREAK_CRITERIA];

  const filtered = stored.filter((c: any): c is TiebreakCriterion => validKeys.has(c));
  if (!filtered.includes('points')) filtered.unshift('points');
  if (!filtered.includes('team_name')) filtered.push('team_name');

  return [...new Set(filtered)];
}

function compareStanding<T extends StandingRowLike>(a: T, b: T, criterion: TiebreakCriterion): number {
  switch (criterion) {
    case 'points':
      return b.points - a.points;
    case 'wins':
      return (b.won ?? 0) - (a.won ?? 0);
    case 'set_ratio': {
      const ratioA = a.setsLost === 0 ? a.setsWon * 1000 : a.setsWon / a.setsLost;
      const ratioB = b.setsLost === 0 ? b.setsWon * 1000 : b.setsWon / b.setsLost;
      return ratioB - ratioA;
    }
    case 'point_diff':
      return (b.pointsWon - b.pointsLost) - (a.pointsWon - a.pointsLost);
    case 'point_ratio': {
      const ratioA = a.pointsLost === 0 ? a.pointsWon * 1000 : a.pointsWon / a.pointsLost;
      const ratioB = b.pointsLost === 0 ? b.pointsWon * 1000 : b.pointsWon / b.pointsLost;
      return ratioB - ratioA;
    }
    case 'team_name':
      return a.teamName.localeCompare(b.teamName);
    default:
      return 0;
  }
}

function resolveHeadToHead<T extends StandingRowLike>(group: T[], matchesRef?: MatchRef[]): T[] {
  if (group.length <= 1 || !matchesRef || matchesRef.length === 0) return group;

  const groupIds = new Set(group.map(r => r.teamId));
  const h2hMap = new Map<string, number>();

  group.forEach(r => h2hMap.set(r.teamId, 0));

  for (const m of matchesRef) {
    if (m.match_type === 'knockout') continue;
    if (!groupIds.has(m.team1_id) || !groupIds.has(m.team2_id)) continue;

    const score = typeof m.score_json === 'object' && m.score_json !== null ? m.score_json : {};
    const winnerId = score?.winner_id || null;
    if (winnerId && groupIds.has(winnerId)) {
      h2hMap.set(winnerId, (h2hMap.get(winnerId) || 0) + 1);
    }
  }

  const allZero = Array.from(h2hMap.values()).every(v => v === 0);
  if (allZero) return group;

  const sorted = [...group].sort((a, b) => (h2hMap.get(b.teamId) || 0) - (h2hMap.get(a.teamId) || 0));

  const topScore = h2hMap.get(sorted[0].teamId) || 0;
  const nextScore = sorted.length > 1 ? h2hMap.get(sorted[1].teamId) || 0 : -1;

  if (topScore === nextScore) return group;

  return sorted;
}

/**
 * Sorts standings rows using the given ordered tiebreak criteria.
 * head_to_head resolves ties among groups of teams within the current position.
 */
export function sortWithTiebreaks<T extends StandingRowLike>(
  rows: T[],
  criteria: TiebreakCriterion[],
  matchesRef?: MatchRef[]
): T[] {
  if (rows.length <= 1) return rows;

  const baseCriteria = criteria.filter(c => c !== 'head_to_head');
  const lastCriterion = baseCriteria[baseCriteria.length - 1] || 'team_name';

  const sorted = [...rows].sort((a, b) => {
    for (const criterion of baseCriteria) {
      const cmp = compareStanding(a, b, criterion);
      if (cmp !== 0) return cmp;
    }
    return compareStanding(a, b, lastCriterion);
  });

  if (!criteria.includes('head_to_head')) return sorted;

  const final: T[] = [];
  let i = 0;

  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length) {
      if (j === i) { j++; continue; }
      let allEqual = true;
      for (const criterion of baseCriteria) {
        if (compareStanding(sorted[i], sorted[j], criterion) !== 0) {
          allEqual = false;
          break;
        }
      }
      if (allEqual) j++;
      else break;
    }

    const tiedGroup = sorted.slice(i, j);
    if (tiedGroup.length > 1 && matchesRef) {
      const resolved = resolveHeadToHead(tiedGroup, matchesRef);
      final.push(...resolved);
    } else {
      final.push(...tiedGroup);
    }
    i = j;
  }

  return final;
}

/**
 * Calculates the best third-placed teams from group standings.
 * Uses sortWithTiebreaks for consistent ordering.
 */
export function calculateBestThirds(
  groupStandingsMap: Map<string, StandingRowSimple[]>,
  count: number,
  criteria?: TiebreakCriterion[],
  matchesRef?: MatchRef[]
): BestThird[] {
  const applicableCriteria = criteria ? criteria.filter(c => c !== 'wins') : DEFAULT_TIEBREAK_CRITERIA.filter(c => c !== 'wins');
  const thirds: { teamId: string; teamName: string; points: number; setsWon: number; setsLost: number; pointsWon: number; pointsLost: number; groupLetter: string }[] = [];

  groupStandingsMap.forEach((rows, letter) => {
    if (rows.length >= 3) {
      thirds.push({
        teamId: rows[2].teamId,
        teamName: rows[2].teamName,
        points: rows[2].points,
        setsWon: rows[2].setsWon,
        setsLost: rows[2].setsLost,
        pointsWon: rows[2].pointsWon,
        pointsLost: rows[2].pointsLost,
        groupLetter: letter,
      });
    }
  });

  const sorted = sortWithTiebreaks(thirds, applicableCriteria, matchesRef).slice(0, count);

  return sorted.map((t, idx) => ({
    teamId: t.teamId,
    teamName: t.teamName,
    rank: idx + 1,
    groupLetter: t.groupLetter,
  }));
}

/**
 * Validates that the knockout qualification config produces a valid power-of-2 bracket.
 */
export function validateKnockoutConfig(
  groupCount: number,
  qualifiersPerGroup: number,
  bestThirdsCount: number
): { valid: boolean; totalQualified: number; bracketSize: number; message: string } {
  const totalQualified = groupCount * qualifiersPerGroup + bestThirdsCount;
  const bracketSize = isPowerOfTwo(totalQualified) ? totalQualified : 0;

  if (!bracketSize || bracketSize < 4) {
    return {
      valid: false,
      totalQualified,
      bracketSize,
      message: `El total de clasificados (${totalQualified}) debe ser una potencia de 2 (4, 8 o 16).`,
    };
  }

  return {
    valid: true,
    totalQualified,
    bracketSize,
    message: bracketSize === 4
      ? 'Llave de Semifinales + Final'
      : bracketSize === 8
      ? 'Llave de Cuartos + Semifinales + Final'
      : 'Llave de Octavos + Cuartos + Semifinales + Final',
  };
}

function isPowerOfTwo(n: number): boolean {
  return n > 0 && (n & (n - 1)) === 0;
}
