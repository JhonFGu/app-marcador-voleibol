export type MatchModality = '2v2' | '3v3' | '4v4' | '5v5' | '6v6';

export interface SetScore {
  team1Points: number;
  team2Points: number;
}

export interface MatchConfig {
  setsToWin: number;       // e.g. 2 sets (Best of 3) or 3 sets (Best of 5)
  regularPoints: number;   // e.g. 21 or 25 points
  tiebreakPoints: number;  // e.g. 15 points
  modality: MatchModality;
  overtimeMode: 'con_alargue' | 'a_muerte';
}

export interface Team {
  id: string;
  name: string;
  players?: Player[];
}

export interface Player {
  id: string;
  teamId: string;
  name: string;
  number?: number;
}

export interface MatchResult {
  sets: SetScore[];
  winnerId: string;
  durationSeconds: number;
}

export interface ActiveMatchState {
  team1: Team;
  team2: Team;
  config: MatchConfig;
  score1: number;       // Current set points for Team 1
  score2: number;       // Current set points for Team 2
  sets1: number;        // Sets won by Team 1
  sets2: number;        // Sets won by Team 2
  setHistory: SetScore[]; // Scores of completed sets
  servingTeam: 'team1' | 'team2' | null;
  timeouts1: number;    // Timeouts used in current set by Team 1
  timeouts2: number;    // Timeouts used in current set by Team 2
  history: MatchSnapshot[]; // For undo/redo
  historyIndex: number;
  isPaused: boolean;
  durationSeconds: number;
  courtPositions1: number[]; // Player numbers or positions (1 to 6)
  courtPositions2: number[];
  pendingSetWinner: 'team1' | 'team2' | null; // Set winner floating dialog state
}

export interface MatchSnapshot {
  score1: number;
  score2: number;
  sets1: number;
  sets2: number;
  setHistory: SetScore[];
  servingTeam: 'team1' | 'team2' | null;
  timeouts1: number;
  timeouts2: number;
  courtPositions1: number[];
  courtPositions2: number[];
  pendingSetWinner: 'team1' | 'team2' | null;
}

