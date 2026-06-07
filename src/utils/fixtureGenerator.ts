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
