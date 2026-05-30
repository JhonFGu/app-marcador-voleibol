import { create } from 'zustand';
import type { ActiveMatchState, MatchConfig, Team, MatchSnapshot } from '../types/sport';

interface MatchStore extends ActiveMatchState {
  // Config status
  isConfigured: boolean;
  swappedSides: boolean; // if true, team1 is on the right (purple), team2 on left (orange)
  matchWinnerId: string | null;

  // Actions
  initMatch: (team1: Team, team2: Team, config: MatchConfig) => void;
  restoreMatch: (
    team1: Team,
    team2: Team,
    config: MatchConfig,
    savedState: {
      score1: number;
      score2: number;
      sets1: number;
      sets2: number;
      setHistory: any[];
      servingTeam: 'team1' | 'team2' | null;
      timeouts1: number;
      timeouts2: number;
      durationSeconds: number;
      courtPositions1: number[];
      courtPositions2: number[];
      pendingSetWinner: 'team1' | 'team2' | null;
    }
  ) => void;
  addPoint: (team: 'team1' | 'team2') => void;
  subPoint: (team: 'team1' | 'team2') => void;
  setServe: (team: 'team1' | 'team2') => void;
  useTimeout: (team: 'team1' | 'team2') => void;
  togglePause: () => void;
  incrementTimer: () => void;
  undo: () => void;
  redo: () => void;
  resetMatch: () => void;
  swapSides: () => void;
  confirmSetWinner: () => void;
}

const initialSnapshot = (state: Partial<ActiveMatchState>): MatchSnapshot => ({
  score1: state.score1 ?? 0,
  score2: state.score2 ?? 0,
  sets1: state.sets1 ?? 0,
  sets2: state.sets2 ?? 0,
  setHistory: [...(state.setHistory ?? [])],
  servingTeam: state.servingTeam ?? null,
  timeouts1: state.timeouts1 ?? 0,
  timeouts2: state.timeouts2 ?? 0,
  courtPositions1: [...(state.courtPositions1 ?? [1, 2, 3, 4, 5, 6])],
  courtPositions2: [...(state.courtPositions2 ?? [1, 2, 3, 4, 5, 6])],
  pendingSetWinner: state.pendingSetWinner ?? null,
});

export const useMatchStore = create<MatchStore>((set, get) => ({
  // Initial state
  team1: { id: 'team1', name: 'Local' },
  team2: { id: 'team2', name: 'Visitante' },
  config: { setsToWin: 2, regularPoints: 25, tiebreakPoints: 15, modality: '6v6', overtimeMode: 'con_alargue' },
  score1: 0,
  score2: 0,
  sets1: 0,
  sets2: 0,
  setHistory: [],
  servingTeam: null,
  timeouts1: 0,
  timeouts2: 0,
  history: [],
  historyIndex: -1,
  isPaused: true,
  durationSeconds: 0,
  courtPositions1: [1, 2, 3, 4, 5, 6],
  courtPositions2: [1, 2, 3, 4, 5, 6],
  isConfigured: false,
  swappedSides: false,
  matchWinnerId: null,
  pendingSetWinner: null,

  initMatch: (team1, team2, config) => {
    const N = config.modality === '2v2' ? 2 : config.modality === '3v3' ? 3 : config.modality === '4v4' ? 4 : config.modality === '5v5' ? 5 : 6;
    const initialPositions = Array.from({ length: N }, (_, i) => i + 1);

    const defaultState = {
      team1,
      team2,
      config,
      score1: 0,
      score2: 0,
      sets1: 0,
      sets2: 0,
      setHistory: [],
      servingTeam: null,
      timeouts1: 0,
      timeouts2: 0,
      isPaused: true,
      durationSeconds: 0,
      courtPositions1: initialPositions,
      courtPositions2: initialPositions,
      isConfigured: true,
      swappedSides: false,
      matchWinnerId: null,
      pendingSetWinner: null,
    };

    const firstSnap = initialSnapshot(defaultState);

    set({
      ...defaultState,
      history: [firstSnap],
      historyIndex: 0,
    });
  },

  restoreMatch: (team1, team2, config, savedState) => {
    const fullState = {
      team1,
      team2,
      config,
      score1: savedState.score1 ?? 0,
      score2: savedState.score2 ?? 0,
      sets1: savedState.sets1 ?? 0,
      sets2: savedState.sets2 ?? 0,
      setHistory: savedState.setHistory ?? [],
      servingTeam: savedState.servingTeam ?? null,
      timeouts1: savedState.timeouts1 ?? 0,
      timeouts2: savedState.timeouts2 ?? 0,
      durationSeconds: savedState.durationSeconds ?? 0,
      courtPositions1: savedState.courtPositions1 ?? Array.from({ length: config.modality === '2v2' ? 2 : config.modality === '3v3' ? 3 : config.modality === '4v4' ? 4 : config.modality === '5v5' ? 5 : 6 }, (_, i) => i + 1),
      courtPositions2: savedState.courtPositions2 ?? Array.from({ length: config.modality === '2v2' ? 2 : config.modality === '3v3' ? 3 : config.modality === '4v4' ? 4 : config.modality === '5v5' ? 5 : 6 }, (_, i) => i + 1),
      isConfigured: true,
      swappedSides: false,
      matchWinnerId: savedState.pendingSetWinner 
        ? null 
        : (savedState.sets1 === config.setsToWin ? team1.id : (savedState.sets2 === config.setsToWin ? team2.id : null)),
      pendingSetWinner: savedState.pendingSetWinner ?? null,
      isPaused: true,
    };

    const firstSnap = initialSnapshot(fullState);

    set({
      ...fullState,
      history: [firstSnap],
      historyIndex: 0,
    });
  },

  addPoint: (team) => {
    const {
      score1,
      score2,
      sets1,
      sets2,
      setHistory,
      servingTeam,
      config,
      history,
      historyIndex,
      team1,
      team2,
      courtPositions1,
      courtPositions2,
      matchWinnerId,
      pendingSetWinner
    } = get();

    if (matchWinnerId || pendingSetWinner) return; // Cannot modify if match/set is over

    let nextScore1 = score1;
    let nextScore2 = score2;
    let nextServingTeam = servingTeam;
    let nextPositions1 = [...courtPositions1];
    let nextPositions2 = [...courtPositions2];
    let setWinner: 'team1' | 'team2' | null = null;
    let finalWinnerId: string | null = null;
    let nextPendingSetWinner: 'team1' | 'team2' | null = null;

    let nextSets1 = sets1;
    let nextSets2 = sets2;
    let nextSetHistory = [...setHistory];

    // Handle point increase and rotation
    if (team === 'team1') {
      nextScore1 += 1;
      if (servingTeam !== 'team1') {
        nextServingTeam = 'team1';
        // Rotate team1 clockwise (shift left: [2, 3, 4, 5, 6, 1])
        const first = nextPositions1.shift()!;
        nextPositions1.push(first);
      }
    } else {
      nextScore2 += 1;
      if (servingTeam !== 'team2') {
        nextServingTeam = 'team2';
        // Rotate team2 clockwise (shift left)
        const first = nextPositions2.shift()!;
        nextPositions2.push(first);
      }
    }

    // Determine target score for the current set
    const currentSetNum = sets1 + sets2 + 1;
    const isTieBreak = config.setsToWin > 1 && currentSetNum === (config.setsToWin * 2 - 1);
    const targetPoints = isTieBreak ? config.tiebreakPoints : config.regularPoints;

    // Check set win condition
    if (config.overtimeMode === 'a_muerte') {
      if (nextScore1 === targetPoints) {
        setWinner = 'team1';
      } else if (nextScore2 === targetPoints) {
        setWinner = 'team2';
      }
    } else {
      // 'con_alargue': reach target points with at least 2 points lead
      if (nextScore1 >= targetPoints && nextScore1 - nextScore2 >= 2) {
        setWinner = 'team1';
      } else if (nextScore2 >= targetPoints && nextScore2 - nextScore1 >= 2) {
        setWinner = 'team2';
      }
    }

    if (setWinner) {
      // Check if this set win would finish the match
      const wouldWinMatch1 = setWinner === 'team1' && (sets1 + 1 === config.setsToWin);
      const wouldWinMatch2 = setWinner === 'team2' && (sets2 + 1 === config.setsToWin);

      if (wouldWinMatch1 || wouldWinMatch2) {
        // If it finishes the match, commit it immediately
        nextSetHistory.push({ team1Points: nextScore1, team2Points: nextScore2 });
        nextScore1 = 0;
        nextScore2 = 0;
        if (wouldWinMatch1) {
          nextSets1 += 1;
          finalWinnerId = team1.id;
        } else {
          nextSets2 += 1;
          finalWinnerId = team2.id;
        }
        set({ timeouts1: 0, timeouts2: 0 });
      } else {
        // It's a set win, but NOT match win. We set pendingSetWinner and do NOT reset scores yet.
        nextPendingSetWinner = setWinner;
      }
    }

    const stateToSnapshot = {
      score1: nextScore1,
      score2: nextScore2,
      sets1: nextSets1,
      sets2: nextSets2,
      setHistory: nextSetHistory,
      servingTeam: nextServingTeam,
      timeouts1: get().timeouts1,
      timeouts2: get().timeouts2,
      courtPositions1: nextPositions1,
      courtPositions2: nextPositions2,
      pendingSetWinner: nextPendingSetWinner,
    };

    const newSnap = initialSnapshot(stateToSnapshot);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newSnap);

    set({
      ...stateToSnapshot,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      matchWinnerId: finalWinnerId,
      // Pause automatically when set/match finishes
      isPaused: setWinner !== null || finalWinnerId !== null ? true : get().isPaused,
    });
  },

  confirmSetWinner: () => {
    const {
      score1,
      score2,
      sets1,
      sets2,
      setHistory,
      pendingSetWinner,
      history,
      historyIndex,
      config
    } = get();

    if (!pendingSetWinner) return;

    let nextSets1 = sets1;
    let nextSets2 = sets2;

    if (pendingSetWinner === 'team1') {
      nextSets1 += 1;
    } else {
      nextSets2 += 1;
    }

    const N = config.modality === '2v2' ? 2 : config.modality === '3v3' ? 3 : config.modality === '4v4' ? 4 : config.modality === '5v5' ? 5 : 6;
    const initialPositions = Array.from({ length: N }, (_, i) => i + 1);

    const stateToSnapshot = {
      score1: 0,
      score2: 0,
      sets1: nextSets1,
      sets2: nextSets2,
      setHistory: [...setHistory, { team1Points: score1, team2Points: score2 }],
      servingTeam: null,
      timeouts1: 0,
      timeouts2: 0,
      courtPositions1: initialPositions,
      courtPositions2: initialPositions,
      pendingSetWinner: null,
    };

    const newSnap = initialSnapshot(stateToSnapshot);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newSnap);

    set({
      ...stateToSnapshot,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      isPaused: true,
    });
  },

  subPoint: (team) => {
    const { score1, score2, history, historyIndex, matchWinnerId, pendingSetWinner } = get();

    if (matchWinnerId || pendingSetWinner) return; // Cannot modify if set/match is over

    let nextScore1 = score1;
    let nextScore2 = score2;

    if (team === 'team1') {
      nextScore1 = Math.max(0, score1 - 1);
    } else {
      nextScore2 = Math.max(0, score2 - 1);
    }

    if (nextScore1 === score1 && nextScore2 === score2) return; // No change

    const stateToSnapshot = {
      score1: nextScore1,
      score2: nextScore2,
      sets1: get().sets1,
      sets2: get().sets2,
      setHistory: get().setHistory,
      servingTeam: get().servingTeam,
      timeouts1: get().timeouts1,
      timeouts2: get().timeouts2,
      courtPositions1: get().courtPositions1,
      courtPositions2: get().courtPositions2,
      pendingSetWinner: null,
    };

    const newSnap = initialSnapshot(stateToSnapshot);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newSnap);

    set({
      ...stateToSnapshot,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  setServe: (team) => {
    const { servingTeam, history, historyIndex } = get();
    if (servingTeam === team) return;

    const stateToSnapshot = {
      score1: get().score1,
      score2: get().score2,
      sets1: get().sets1,
      sets2: get().sets2,
      setHistory: get().setHistory,
      servingTeam: team,
      timeouts1: get().timeouts1,
      timeouts2: get().timeouts2,
      courtPositions1: get().courtPositions1,
      courtPositions2: get().courtPositions2,
      pendingSetWinner: get().pendingSetWinner,
    };

    const newSnap = initialSnapshot(stateToSnapshot);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newSnap);

    set({
      ...stateToSnapshot,
      history: newHistory,
      historyIndex: newHistory.length - 1,
    });
  },

  useTimeout: (team) => {
    const { timeouts1, timeouts2, history, historyIndex, matchWinnerId, pendingSetWinner } = get();
    if (matchWinnerId || pendingSetWinner) return;

    let nextTimeouts1 = timeouts1;
    let nextTimeouts2 = timeouts2;

    if (team === 'team1') {
      if (timeouts1 >= 2) return;
      nextTimeouts1 += 1;
    } else {
      if (timeouts2 >= 2) return;
      nextTimeouts2 += 1;
    }

    const stateToSnapshot = {
      score1: get().score1,
      score2: get().score2,
      sets1: get().sets1,
      sets2: get().sets2,
      setHistory: get().setHistory,
      servingTeam: get().servingTeam,
      timeouts1: nextTimeouts1,
      timeouts2: nextTimeouts2,
      courtPositions1: get().courtPositions1,
      courtPositions2: get().courtPositions2,
      pendingSetWinner: get().pendingSetWinner,
    };

    const newSnap = initialSnapshot(stateToSnapshot);
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(newSnap);

    set({
      ...stateToSnapshot,
      history: newHistory,
      historyIndex: newHistory.length - 1,
      isPaused: true,
    });
  },

  togglePause: () => {
    set((state) => ({ isPaused: !state.isPaused }));
  },

  incrementTimer: () => {
    const { isPaused, durationSeconds } = get();
    if (!isPaused) {
      set({ durationSeconds: durationSeconds + 1 });
    }
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex <= 0) return;

    const prevIndex = historyIndex - 1;
    const snap = history[prevIndex];

    let finalWinnerId = null;
    if (snap.sets1 === get().config.setsToWin) {
      finalWinnerId = get().team1.id;
    } else if (snap.sets2 === get().config.setsToWin) {
      finalWinnerId = get().team2.id;
    }

    set({
      score1: snap.score1,
      score2: snap.score2,
      sets1: snap.sets1,
      sets2: snap.sets2,
      setHistory: [...snap.setHistory],
      servingTeam: snap.servingTeam,
      timeouts1: snap.timeouts1,
      timeouts2: snap.timeouts2,
      courtPositions1: [...snap.courtPositions1],
      courtPositions2: [...snap.courtPositions2],
      historyIndex: prevIndex,
      matchWinnerId: finalWinnerId,
      pendingSetWinner: snap.pendingSetWinner,
    });
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex >= history.length - 1) return;

    const nextIndex = historyIndex + 1;
    const snap = history[nextIndex];

    let finalWinnerId = null;
    if (snap.sets1 === get().config.setsToWin) {
      finalWinnerId = get().team1.id;
    } else if (snap.sets2 === get().config.setsToWin) {
      finalWinnerId = get().team2.id;
    }

    set({
      score1: snap.score1,
      score2: snap.score2,
      sets1: snap.sets1,
      sets2: snap.sets2,
      setHistory: [...snap.setHistory],
      servingTeam: snap.servingTeam,
      timeouts1: snap.timeouts1,
      timeouts2: snap.timeouts2,
      courtPositions1: [...snap.courtPositions1],
      courtPositions2: [...snap.courtPositions2],
      historyIndex: nextIndex,
      matchWinnerId: finalWinnerId,
      pendingSetWinner: snap.pendingSetWinner,
    });
  },

  resetMatch: () => {
    const { team1, team2, config } = get();
    get().initMatch(team1, team2, config);
  },

  swapSides: () => {
    set((state) => ({ swappedSides: !state.swappedSides }));
  },
}));
