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

  // If odd number of teams, add a dummy team for bye rounds
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

      // Fixed pivot for the first index
      if (i === 0) {
        away = teams[numTeams - 1];
      }

      // Skip bye rounds
      if (home !== 'BYE' && away !== 'BYE') {
        // Alternating home/away for fair hosting
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

        // Rotate courts dynamically
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

  // Distribute teams to groups
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

  // Generate round-robin matches for each group
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

/**
 * Returns the smallest power of 2 that is >= n.
 */
function nextPowerOf2(n: number): number {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}

/**
 * Returns a human-readable round name for a knockout round.
 */
function getRoundName(totalRounds: number, roundIndex: number): string {
  const remaining = totalRounds - roundIndex;
  if (remaining === 0) return 'Final';
  if (remaining === 1) return 'Semifinal';
  if (remaining === 2) return 'Cuartos';
  if (remaining === 3) return 'Octavos';
  return `Ronda ${roundIndex + 1}`;
}

export interface PlayoffMatch extends GeneratedMatch {
  bracket_position?: number; // position within the round (0-indexed), also stored in score_json
}

/**
 * Generates the full playoff bracket for N classified teams using Option A (byes).
 * Works for any N >= 2.
 * 
 * @param rankedTeamIds - Teams ordered by overall ranking (best first)
 * @param tournamentId - Tournament ID
 * @param courtCount - Number of courts available
 * @returns Array of all playoff matches including placeholders for future rounds
 */
export function generatePlayoffBracket(
  rankedTeamIds: string[],
  tournamentId: string,
  courtCount: number
): PlayoffMatch[] {
  const N = rankedTeamIds.length;
  if (N < 2) return [];

  const bracketSize = nextPowerOf2(N);
  const totalRounds = Math.log2(bracketSize);
  const allMatches: PlayoffMatch[] = [];

  // Build seeding for the first round (bracketSize / 2 slots)
  // Standard tournament seeding: 1v(bracketSize), 2v(bracketSize-1), etc.
  const firstRoundSlots = bracketSize / 2;
  
  // Create seed pairings using standard bracket seeding
  const seedPairings: { seed1: number; seed2: number }[] = [];
  for (let i = 0; i < firstRoundSlots; i++) {
    seedPairings.push({
      seed1: i + 1,
      seed2: bracketSize - i
    });
  }

  // Rearrange pairings to avoid same-group clashes in early rounds
  // Use standard bracket ordering (1v16, 8v9, 5v12, 4v13, 3v14, 6v11, 7v10, 2v15)
  function bracketOrder(slots: number): number[] {
    if (slots === 1) return [0];
    const half = bracketOrder(slots / 2);
    const result: number[] = [];
    for (const h of half) {
      result.push(h);
      result.push(slots - 1 - h);
    }
    return result;
  }

  const order = bracketOrder(firstRoundSlots);
  const orderedPairings = order.map(i => seedPairings[i]);

  let courtIndex = 1;
  let matchRound = 1;

  // --- ROUND 1: First round matches (some may be byes) ---
  const roundName = getRoundName(totalRounds, 0);
  
  for (let i = 0; i < orderedPairings.length; i++) {
    const { seed1, seed2 } = orderedPairings[i];
    
    // If seed2 > N, it means this is a bye (the high seed doesn't exist)
    const isBye = seed2 > N;
    
    if (isBye) {
      // Don't create a match for byes - the team advances directly
      // We'll handle this when creating round 2 matches
      continue;
    }

    const team1Id = rankedTeamIds[seed1 - 1]; // seed is 1-indexed
    const team2Id = rankedTeamIds[seed2 - 1];

    allMatches.push({
      tournament_id: tournamentId,
      team1_id: team1Id,
      team2_id: team2Id,
      court: courtIndex,
      status: 'pending',
      score_json: { sets: [], winner_id: null, bracket_position: i },
      match_type: 'knockout',
      group_name: roundName,
      round: matchRound,
      bracket_position: i,
    });

    courtIndex = (courtIndex % courtCount) + 1;
  }

  // --- SUBSEQUENT ROUNDS ---
  // Build the full bracket tree for rounds 2 through totalRounds
  for (let r = 1; r < totalRounds; r++) {
    matchRound++;
    const roundMatchCount = firstRoundSlots / Math.pow(2, r);
    const roundLabel = getRoundName(totalRounds, r);

    for (let i = 0; i < roundMatchCount; i++) {
      // Check if any team gets a bye into this slot from round 1
      let team1Id = '';
      let team2Id = '';

      if (r === 1) {
        // For round 2, check if either feeder from round 1 was a bye
        const feeder1Idx = i * 2;
        const feeder2Idx = i * 2 + 1;
        const feeder1Pairing = orderedPairings[feeder1Idx];
        const feeder2Pairing = orderedPairings[feeder2Idx];

        const feeder1IsBye = feeder1Pairing.seed2 > N;
        const feeder2IsBye = feeder2Pairing.seed2 > N;

        if (feeder1IsBye) {
          team1Id = rankedTeamIds[feeder1Pairing.seed1 - 1];
        }
        if (feeder2IsBye) {
          team2Id = rankedTeamIds[feeder2Pairing.seed1 - 1];
        }
      }

      allMatches.push({
        tournament_id: tournamentId,
        team1_id: team1Id, // empty string = TBD (will be filled when previous match finishes)
        team2_id: team2Id,
        court: courtIndex,
        status: 'pending',
        score_json: { sets: [], winner_id: null, bracket_position: i },
        match_type: 'knockout',
        group_name: roundLabel,
        round: matchRound,
        bracket_position: i,
      });

      courtIndex = (courtIndex % courtCount) + 1;
    }
  }

  return allMatches;
}
