import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  Undo, Redo, Volume2, VolumeX, 
  Play, Pause, ArrowLeftRight, RotateCcw, ArrowLeft, Loader2
} from 'lucide-react';
import { useMatchStore } from '../store/matchStore';
import { supabase } from '../supabaseClient';

export default function RefScoreboard() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();
  
  const {
    team1, team2, config, score1, score2, sets1, sets2,
    setHistory, servingTeam, timeouts1, timeouts2,
    isPaused, durationSeconds, courtPositions1, courtPositions2,
    isConfigured, swappedSides, matchWinnerId, pendingSetWinner,
    initMatch, restoreMatch, addPoint, subPoint, setServe, useTimeout,
    togglePause, incrementTimer, undo, redo, resetMatch, swapSides, confirmSetWinner
  } = useMatchStore();

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [timeoutCountdown, setTimeoutCountdown] = useState<number | null>(null);
  const [timeoutTeam, setTimeoutTeam] = useState<'team1' | 'team2' | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showRotations, setShowRotations] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [courtNumber, setCourtNumber] = useState<number>(1);

  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Duration Timer Interval
  useEffect(() => {
    const interval = setInterval(() => {
      incrementTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, [incrementTimer]);

  // Load Match details from Supabase on mount
  useEffect(() => {
    if (matchId) {
      fetchAndSetupMatch();
    }
  }, [matchId]);

  const fetchAndSetupMatch = async () => {
    setLoading(true);
    try {
      // 1. Get Match record
      const { data: matchData, error: mErr } = await supabase
        .from('matches')
        .select('*, tournament:tournaments(*), team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*)')
        .eq('id', matchId)
        .single();

      if (mErr) throw mErr;

      setTournamentId(matchData.tournament_id);
      setCourtNumber(matchData.court || 1);

      // 2. Extract configuration from tournament
      const tConfig = matchData.tournament.config_json || {};
      const matchConfig = {
        setsToWin: tConfig.setsToWin || 2,
        regularPoints: tConfig.regularPoints || 25,
        tiebreakPoints: tConfig.tiebreakPoints || 15,
        modality: tConfig.modality || '6v6',
        overtimeMode: tConfig.overtimeMode || 'con_alargue'
      };

      const localTeam1 = { id: matchData.team1_id, name: matchData.team1?.name || 'Local' };
      const localTeam2 = { id: matchData.team2_id, name: matchData.team2?.name || 'Visitante' };

      // 3. Initialize or restore match
      if (matchData.status === 'pending') {
        const mod = matchConfig.modality;
        const numP = mod === '2v2' ? 2 : mod === '3v3' ? 3 : mod === '4v4' ? 4 : mod === '5v5' ? 5 : 6;
        const initialPositions = Array.from({ length: numP }, (_, i) => i + 1);

        // Change status to in_progress and save initial state
        const initialScoreJson = {
          sets: [],
          current_set: { team1: 0, team2: 0 },
          sets_won: { team1: 0, team2: 0 },
          serving_team: null,
          timeouts1: 0,
          timeouts2: 0,
          courtPositions1: initialPositions,
          courtPositions2: initialPositions,
          pendingSetWinner: null,
          winner_id: null,
          duration_seconds: 0
        };

        const { error: updErr } = await supabase
          .from('matches')
          .update({
            status: 'in_progress',
            score_json: initialScoreJson
          })
          .eq('id', matchId);

        if (updErr) throw updErr;

        initMatch(localTeam1, localTeam2, matchConfig);
      } else {
        // Restore existing states
        const saved = matchData.score_json || {};
        restoreMatch(localTeam1, localTeam2, matchConfig, {
          score1: saved.current_set?.team1 ?? 0,
          score2: saved.current_set?.team2 ?? 0,
          sets1: saved.sets_won?.team1 ?? 0,
          sets2: saved.sets_won?.team2 ?? 0,
          setHistory: saved.sets ?? [],
          servingTeam: saved.serving_team ?? null,
          timeouts1: saved.timeouts1 ?? 0,
          timeouts2: saved.timeouts2 ?? 0,
          durationSeconds: saved.duration_seconds ?? 0,
          courtPositions1: saved.courtPositions1 ?? Array.from({ length: matchConfig.modality === '2v2' ? 2 : matchConfig.modality === '3v3' ? 3 : matchConfig.modality === '4v4' ? 4 : matchConfig.modality === '5v5' ? 5 : 6 }, (_, i) => i + 1),
          courtPositions2: saved.courtPositions2 ?? Array.from({ length: matchConfig.modality === '2v2' ? 2 : matchConfig.modality === '3v3' ? 3 : matchConfig.modality === '4v4' ? 4 : matchConfig.modality === '5v5' ? 5 : 6 }, (_, i) => i + 1),
          pendingSetWinner: saved.pendingSetWinner ?? null
        });
      }
    } catch (e) {
      console.error(e);
      alert('Error al inicializar el arbitraje de este partido.');
      navigate('/admin/dashboard');
    } finally {
      setLoading(false);
    }
  };

  // Sync state to Supabase on changes (excluding seconds tick directly)
  useEffect(() => {
    if (loading || !isConfigured || !matchId) return;

    const syncState = async () => {
      const score_json = {
        sets: setHistory,
        current_set: { team1: score1, team2: score2 },
        sets_won: { team1: sets1, team2: sets2 },
        serving_team: servingTeam,
        timeouts1,
        timeouts2,
        courtPositions1,
        courtPositions2,
        pendingSetWinner,
        winner_id: matchWinnerId,
        duration_seconds: durationSeconds
      };

      const status = matchWinnerId ? 'finished' : 'in_progress';

      const { error } = await supabase
        .from('matches')
        .update({
          score_json,
          status
        })
        .eq('id', matchId);

      if (error) {
        console.error('Error syncing match score to Supabase:', error);
      }
    };

    syncState();
  }, [
    score1, score2, sets1, sets2, servingTeam, timeouts1, timeouts2,
    courtPositions1, courtPositions2, pendingSetWinner, matchWinnerId, setHistory,
    loading, isConfigured, matchId
  ]);

  // Timeout countdown timer logic
  useEffect(() => {
    if (timeoutCountdown !== null) {
      if (timeoutCountdown > 0) {
        const timer = setTimeout(() => {
          setTimeoutCountdown(timeoutCountdown - 1);
        }, 1000);
        return () => clearTimeout(timer);
      } else {
        playAudio('buzzer');
        setTimeoutCountdown(null);
        setTimeoutTeam(null);
      }
    }
  }, [timeoutCountdown]);

  // Set Whistle audio play
  useEffect(() => {
    if (pendingSetWinner) {
      playAudio('whistle');
    }
  }, [pendingSetWinner]);

  // Sound generator
  const playAudio = (type: 'beep' | 'whistle' | 'buzzer') => {
    if (!soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'beep') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'whistle') {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2200, ctx.currentTime);
        osc.frequency.linearRampToValueAtTime(2400, ctx.currentTime + 0.1);
        osc.frequency.linearRampToValueAtTime(2100, ctx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.2, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35);
        osc.start();
        osc.stop(ctx.currentTime + 0.35);
      } else if (type === 'buzzer') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(120, ctx.currentTime);
        gain.gain.setValueAtTime(0.25, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.45);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.6);
        osc.start();
        osc.stop(ctx.currentTime + 0.6);
      }
    } catch (e) {
      console.warn("AudioContext failed to start", e);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleScoreTap = (team: 'team1' | 'team2') => {
    if (isPaused) {
      togglePause();
    }
    playAudio('beep');
    addPoint(team);
  };

  const handleTimeoutClick = (team: 'team1' | 'team2') => {
    const isTeam1 = team === 'team1';
    const current = isTeam1 ? timeouts1 : timeouts2;
    if (current >= 2) return;

    playAudio('whistle');
    useTimeout(team);
    setTimeoutCountdown(30);
    setTimeoutTeam(team);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white font-sans">
        <Loader2 className="w-6 h-6 animate-spin text-orange-brand" />
      </div>
    );
  }

  // Side mapping
  const leftTeamKey = swappedSides ? 'team2' : 'team1';
  const rightTeamKey = swappedSides ? 'team1' : 'team2';

  const leftTeamName = swappedSides ? team2.name : team1.name;
  const rightTeamName = swappedSides ? team1.name : team2.name;

  const leftScore = swappedSides ? score2 : score1;
  const rightScore = swappedSides ? score1 : score2;

  const leftSets = swappedSides ? sets2 : sets1;
  const rightSets = swappedSides ? sets1 : sets2;

  const leftTimeouts = swappedSides ? timeouts2 : timeouts1;
  const rightTimeouts = swappedSides ? timeouts1 : timeouts2;

  const leftPositions = swappedSides ? courtPositions2 : courtPositions1;
  const rightPositions = swappedSides ? courtPositions1 : courtPositions2;

  const renderCourtGrid = () => {
    const renderPlayerSlot = (positions: number[], index: number, label: string, isLeft: boolean) => {
      if (index >= positions.length) {
        return (
          <div className="bg-zinc-900/10 py-1.5 rounded-lg border border-zinc-900/10 text-zinc-800 text-[10px] font-bold min-h-[42px] flex items-center justify-center select-none">
            —
          </div>
        );
      }
      const playerNum = positions[index];
      const isServer = index === 0;
      const borderClass = isLeft
        ? (isServer ? 'border-orange-brand bg-orange-brand/10' : 'border-orange-brand/10')
        : (isServer ? 'border-purple-brand bg-purple-brand/10' : 'border-purple-brand/10');
      const textClass = isLeft ? 'text-orange-brand' : 'text-purple-brand';
      const showBall = isLeft ? servingTeam === leftTeamKey : servingTeam === rightTeamKey;

      return (
        <div className={`bg-zinc-900/60 py-1.5 rounded-lg text-xs font-bold border relative flex flex-col items-center justify-center min-h-[42px] transition-all ${borderClass} ${textClass}`}>
          <span className="block text-[7px] text-zinc-550 font-sans uppercase tracking-wider">{label}</span>
          <span className="text-sm font-black">{playerNum}</span>
          {isServer && showBall && (
            <span className={`absolute ${isLeft ? 'right-1.5' : 'left-1.5'} bottom-1 text-[9px] animate-pulse`}>🏐</span>
          )}
        </div>
      );
    };

    return (
      <div className="px-4 pb-4 w-full max-w-xl mx-auto z-0">
        <div className="bg-zinc-950/60 border border-zinc-900 rounded-2xl p-3">
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest block text-center mb-2">
            Posiciones de Rotación (Red al Centro)
          </span>
          <div className="grid grid-cols-2 gap-3 relative">
            <div className="absolute top-0 bottom-0 left-1/2 -ml-[1px] border-l-2 border-dashed border-zinc-700 z-10 pointer-events-none" />

            {/* Left Court (Orange) */}
            <div className="bg-orange-brand/5 border border-orange-brand/15 p-2 rounded-xl flex flex-col gap-1.5 relative">
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(leftPositions, 4, "Pos 5 (Zag L)", true)}
                {renderPlayerSlot(leftPositions, 3, "Pos 4 (Fre L)", true)}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(leftPositions, 5, "Pos 6 (Zag C)", true)}
                {renderPlayerSlot(leftPositions, 2, "Pos 3 (Fre C)", true)}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(leftPositions, 0, "Pos 1 (Saque)", true)}
                {renderPlayerSlot(leftPositions, 1, "Pos 2 (Fre R)", true)}
              </div>
            </div>

            {/* Right Court (Purple) */}
            <div className="bg-purple-brand/5 border border-purple-brand/15 p-2 rounded-xl flex flex-col gap-1.5 relative">
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(rightPositions, 1, "Pos 2 (Fre R)", false)}
                {renderPlayerSlot(rightPositions, 0, "Pos 1 (Saque)", false)}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(rightPositions, 2, "Pos 3 (Fre C)", false)}
                {renderPlayerSlot(rightPositions, 5, "Pos 6 (Zag C)", false)}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(rightPositions, 3, "Pos 4 (Fre L)", false)}
                {renderPlayerSlot(rightPositions, 4, "Pos 5 (Zag L)", false)}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white select-none relative overflow-hidden font-sans">
      
      {/* 1. TOP HEADER */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-900 bg-zinc-950/60 backdrop-blur-md z-10">
        <button
          onClick={() => {
            if (tournamentId) navigate(`/admin/tournament/${tournamentId}/play`);
            else navigate('/admin/dashboard');
          }}
          className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors flex items-center gap-1 text-xs font-bold text-gray-300"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Salir
        </button>

        <span className="text-[10px] text-zinc-500 font-black tracking-widest uppercase">
          Árbitro • Cancha {courtNumber}
        </span>

        {/* Dynamic Timer Badge */}
        <button
          onClick={togglePause}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all ${
            isPaused 
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-500'
              : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
          }`}
        >
          {isPaused ? <Play className="w-3 h-3 fill-current" /> : <Pause className="w-3 h-3 fill-current" />}
          {formatTime(durationSeconds)}
        </button>
      </div>

      {/* 2. MATCH INFORMATION BAR */}
      <div className="bg-zinc-950/30 border-b border-zinc-900 px-4 py-1.5 text-center flex items-center justify-center gap-3 text-[10px] font-bold text-gray-400 z-10">
        <span>Sets para ganar: {config.setsToWin}</span>
        <span>•</span>
        <span>Set normal a {config.regularPoints} pts</span>
        {setHistory.length > 0 && (
          <>
            <span>•</span>
            <span className="text-zinc-500">
              Historial: {setHistory.map((s, i) => `(S${i+1}: ${s.team1Points}-${s.team2Points})`).join(' ')}
            </span>
          </>
        )}
      </div>

      {/* 3. SCOREBOARD PANELS AREA */}
      {isLandscape ? (
        <div className="flex-grow grid grid-cols-2 relative">
          {/* Left Side: Local (Orange) */}
          <div 
            onClick={() => handleScoreTap(leftTeamKey)}
            className="relative bg-orange-brand hover:bg-orange-brand/90 active:bg-orange-brand transition-all flex flex-col justify-between p-4 cursor-pointer border-r border-zinc-900"
          >
            {/* Top layout side info */}
            <div className="flex items-center justify-between pointer-events-none">
              <h2 className="text-lg font-black tracking-tight text-white uppercase">
                {leftTeamName}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-white/70">SETS:</span>
                <span className="text-2xl font-black font-mono text-white">{leftSets}</span>
              </div>
            </div>

            {/* Giant Score */}
            <div className="my-auto text-center flex flex-col justify-center items-center">
              <span className="text-[7.5rem] xs:text-[9.5rem] sm:text-[11rem] md:text-[13rem] font-bold font-digital text-white tracking-tighter block leading-none digital-glow-white pointer-events-none">
                {leftScore.toString().padStart(2, '0')}
              </span>
              
              {/* Quick point adjustment buttons */}
              <div className="flex items-center justify-center gap-6 mt-4 w-full max-w-[160px]" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    playAudio('beep');
                    subPoint(leftTeamKey);
                  }}
                  disabled={leftScore === 0}
                  className="w-12 h-12 flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/20 rounded-full font-black text-2xl text-white active:scale-95 transition-all disabled:opacity-30"
                >
                  -
                </button>
                <button
                  onClick={() => handleScoreTap(leftTeamKey)}
                  className="w-12 h-12 flex items-center justify-center bg-white/20 hover:bg-white/30 border border-white/30 rounded-full font-black text-2xl text-white active:scale-95 transition-all"
                >
                  +
                </button>
              </div>
              <span className="text-[9px] uppercase font-bold text-white/70 mt-2 block pointer-events-none">
                Toca la tarjeta para sumar
              </span>
            </div>

            {/* Bottom Action bar */}
            <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => handleTimeoutClick(leftTeamKey)}
                disabled={leftTimeouts >= 2 || timeoutCountdown !== null}
                className="px-3 py-2 bg-white/10 border border-white/20 disabled:opacity-30 font-bold text-[10px] text-white rounded-xl hover:bg-white/20 hover:border-white/40 transition-colors"
              >
                ⏱️ Tiempo Fuera ({leftTimeouts}/2)
              </button>
              <button
                onClick={() => setServe(leftTeamKey)}
                className={`px-3 py-2 border font-bold text-[10px] rounded-xl flex items-center gap-1.5 transition-colors ${
                  servingTeam === leftTeamKey
                    ? 'bg-white border-white text-orange-brand'
                    : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'
                }`}
              >
                🏐 Saque {servingTeam === leftTeamKey && '✔'}
              </button>
            </div>
          </div>

          {/* Right Side: Visitor (Purple) */}
          <div 
            onClick={() => handleScoreTap(rightTeamKey)}
            className="relative bg-purple-brand hover:bg-purple-brand/90 active:bg-purple-brand transition-all flex flex-col justify-between p-4 cursor-pointer"
          >
            {/* Top layout side info */}
            <div className="flex items-center justify-between pointer-events-none">
              <h2 className="text-lg font-black tracking-tight text-white uppercase">
                {rightTeamName}
              </h2>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-white/70">SETS:</span>
                <span className="text-2xl font-black font-mono text-white">{rightSets}</span>
              </div>
            </div>

            {/* Giant Score */}
            <div className="my-auto text-center flex flex-col justify-center items-center">
              <span className="text-[7.5rem] xs:text-[9.5rem] sm:text-[11rem] md:text-[13rem] font-bold font-digital text-white tracking-tighter block leading-none digital-glow-white pointer-events-none">
                {rightScore.toString().padStart(2, '0')}
              </span>
              
              {/* Quick point adjustment buttons */}
              <div className="flex items-center justify-center gap-6 mt-4 w-full max-w-[160px]" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    playAudio('beep');
                    subPoint(rightTeamKey);
                  }}
                  disabled={rightScore === 0}
                  className="w-12 h-12 flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/20 rounded-full font-black text-2xl text-white active:scale-95 transition-all disabled:opacity-30"
                >
                  -
                </button>
                <button
                  onClick={() => handleScoreTap(rightTeamKey)}
                  className="w-12 h-12 flex items-center justify-center bg-white/20 hover:bg-white/30 border border-white/30 rounded-full font-black text-2xl text-white active:scale-95 transition-all"
                >
                  +
                </button>
              </div>
              <span className="text-[9px] uppercase font-bold text-white/70 mt-2 block pointer-events-none">
                Toca la tarjeta para sumar
              </span>
            </div>

            {/* Bottom Action bar */}
            <div className="flex items-center justify-between" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={() => handleTimeoutClick(rightTeamKey)}
                disabled={rightTimeouts >= 2 || timeoutCountdown !== null}
                className="px-3 py-2 bg-white/10 border border-white/20 disabled:opacity-30 font-bold text-[10px] text-white rounded-xl hover:bg-white/20 hover:border-white/40 transition-colors"
              >
                ⏱️ Tiempo Fuera ({rightTimeouts}/2)
              </button>
              <button
                onClick={() => setServe(rightTeamKey)}
                className={`px-3 py-2 border font-bold text-[10px] rounded-xl flex items-center gap-1.5 transition-colors ${
                  servingTeam === rightTeamKey
                    ? 'bg-white border-white text-purple-brand'
                    : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'
                }`}
              >
                🏐 Saque {servingTeam === rightTeamKey && '✔'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* PORTRAIT LAYOUT: compact side-by-side cards */
        <div className="flex flex-col flex-grow p-3 gap-3 relative z-0 justify-center">
          <div className="grid grid-cols-2 gap-3 w-full items-stretch">
            {/* LEFT CARD (ORANGE) */}
            <div className="flex flex-col items-center justify-between rounded-2xl bg-orange-brand hover:bg-orange-brand/95 transition-all p-3 pb-4 relative overflow-hidden border border-orange-500/30">
              <div className="absolute top-0 left-0 right-0 h-1 bg-orange-brand" />
              <div className="flex items-center justify-between w-full mb-2 px-1">
                <span className="text-[10px] text-white/80 font-mono font-bold">SETS: {leftSets}</span>
                {servingTeam === leftTeamKey && (
                  <span className="flex items-center justify-center w-4 h-4 bg-white text-orange-brand rounded-full text-[9px] font-black animate-bounce shadow">🏐</span>
                )}
              </div>
              <h2 className="text-sm font-black text-white uppercase truncate max-w-[90%] mb-2.5">{leftTeamName}</h2>
              <div
                onClick={() => handleScoreTap(leftTeamKey)}
                className="w-full h-44 xs:h-52 flex items-center justify-center bg-white/10 border border-white/20 rounded-xl cursor-pointer hover:border-white/50 transition-all select-none active:scale-[0.96]"
              >
                <span className="font-digital text-[6.5rem] xs:text-[8rem] font-bold text-white select-none leading-none tracking-tighter digital-glow-white">
                  {leftScore.toString().padStart(2, '0')}
                </span>
              </div>
              <div className="flex flex-col items-center w-full gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-4 w-full">
                  <button
                    onClick={() => {
                      playAudio('beep');
                      subPoint(leftTeamKey);
                    }}
                    disabled={leftScore === 0}
                    className="w-11 h-11 flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/20 rounded-full font-black text-2xl text-white active:scale-95 transition-all disabled:opacity-30"
                  >
                    -
                  </button>
                  <button
                    onClick={() => handleScoreTap(leftTeamKey)}
                    className="w-11 h-11 flex items-center justify-center bg-white/20 hover:bg-white/30 border border-white/30 rounded-full font-black text-2xl text-white active:scale-95 transition-all"
                  >
                    +
                  </button>
                </div>
                <div className="flex justify-between w-full gap-1 mt-1.5">
                  <button
                    onClick={() => handleTimeoutClick(leftTeamKey)}
                    disabled={leftTimeouts >= 2 || timeoutCountdown !== null}
                    className="flex-1 py-1.5 bg-white/10 border border-white/20 text-[10px] font-bold text-white rounded-lg hover:bg-white/20 disabled:opacity-30"
                  >
                    ⏱️ Tiempo ({leftTimeouts}/2)
                  </button>
                  <button
                    onClick={() => setServe(leftTeamKey)}
                    className={`flex-1 py-1.5 border text-[10px] font-bold rounded-lg ${
                      servingTeam === leftTeamKey
                        ? 'bg-white border-white text-orange-brand'
                        : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    🏐 Saque
                  </button>
                </div>
              </div>
            </div>

            {/* RIGHT CARD (PURPLE) */}
            <div className="flex flex-col items-center justify-between rounded-2xl bg-purple-brand hover:bg-purple-brand/95 transition-all p-3 pb-4 relative overflow-hidden border border-purple-500/30">
              <div className="absolute top-0 left-0 right-0 h-1 bg-purple-brand" />
              <div className="flex items-center justify-between w-full mb-2 px-1">
                <span className="text-[10px] text-white/80 font-mono font-bold">SETS: {rightSets}</span>
                {servingTeam === rightTeamKey && (
                  <span className="flex items-center justify-center w-4 h-4 bg-white text-purple-brand rounded-full text-[9px] font-black animate-bounce shadow">🏐</span>
                )}
              </div>
              <h2 className="text-sm font-black text-white uppercase truncate max-w-[90%] mb-2.5">{rightTeamName}</h2>
              <div
                onClick={() => handleScoreTap(rightTeamKey)}
                className="w-full h-44 xs:h-52 flex items-center justify-center bg-white/10 border border-white/20 rounded-xl cursor-pointer hover:border-white/50 transition-all select-none active:scale-[0.96]"
              >
                <span className="font-digital text-[6.5rem] xs:text-[8rem] font-bold text-white select-none leading-none tracking-tighter digital-glow-white">
                  {rightScore.toString().padStart(2, '0')}
                </span>
              </div>
              <div className="flex flex-col items-center w-full gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-4 w-full">
                  <button
                    onClick={() => {
                      playAudio('beep');
                      subPoint(rightTeamKey);
                    }}
                    disabled={rightScore === 0}
                    className="w-11 h-11 flex items-center justify-center bg-black/40 hover:bg-black/60 border border-white/20 rounded-full font-black text-2xl text-white active:scale-95 transition-all disabled:opacity-30"
                  >
                    -
                  </button>
                  <button
                    onClick={() => handleScoreTap(rightTeamKey)}
                    className="w-11 h-11 flex items-center justify-center bg-white/20 hover:bg-white/30 border border-white/30 rounded-full font-black text-2xl text-white active:scale-95 transition-all"
                  >
                    +
                  </button>
                </div>
                <div className="flex justify-between w-full gap-1 mt-1.5">
                  <button
                    onClick={() => handleTimeoutClick(rightTeamKey)}
                    disabled={rightTimeouts >= 2 || timeoutCountdown !== null}
                    className="flex-1 py-1.5 bg-white/10 border border-white/20 text-[10px] font-bold text-white rounded-lg hover:bg-white/20 disabled:opacity-30"
                  >
                    ⏱️ Tiempo ({rightTimeouts}/2)
                  </button>
                  <button
                    onClick={() => setServe(rightTeamKey)}
                    className={`flex-1 py-1.5 border text-[10px] font-bold rounded-lg ${
                      servingTeam === rightTeamKey
                        ? 'bg-white border-white text-purple-brand'
                        : 'bg-white/10 border-white/20 text-white/80 hover:bg-white/20'
                    }`}
                  >
                    🏐 Saque
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. CANCHA rotation layout */}
      {showRotations && renderCourtGrid()}

      {/* 5. BOTTOM ACTIONS TOOLBAR */}
      <div className="px-4 py-3 border-t border-zinc-900 bg-zinc-950/60 flex items-center justify-between gap-2 z-10">
        <div className="flex items-center gap-1.5">
          <button 
            onClick={undo}
            className="p-2.5 bg-zinc-900 border border-zinc-850 hover:text-white text-zinc-400 rounded-xl active:scale-[0.93] transition-all"
            title="Deshacer"
          >
            <Undo className="w-4 h-4" />
          </button>
          <button 
            onClick={redo}
            className="p-2.5 bg-zinc-900 border border-zinc-850 hover:text-white text-zinc-400 rounded-xl active:scale-[0.93] transition-all"
            title="Rehacer"
          >
            <Redo className="w-4 h-4" />
          </button>
          <button 
            onClick={swapSides}
            className="p-2.5 bg-zinc-900 border border-zinc-850 hover:text-white text-zinc-400 rounded-xl active:scale-[0.93] transition-all"
            title="Cambiar de Lado"
          >
            <ArrowLeftRight className="w-4 h-4" />
          </button>
          <button 
            onClick={() => setShowRotations(!showRotations)}
            className={`p-2.5 border rounded-xl text-xs font-bold transition-all ${
              showRotations
                ? 'bg-orange-brand/20 border-orange-brand text-orange-brand'
                : 'bg-zinc-900 border-zinc-850 text-gray-400 hover:text-white'
            }`}
            title="Mostrar Rotaciones"
          >
            Rotación {showRotations ? '▼' : '▲'}
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button 
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 bg-zinc-900 border border-zinc-850 text-zinc-450 hover:text-zinc-200 rounded-xl transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          
          <button 
            onClick={() => {
              if (confirm('¿Restar un punto al equipo Local?')) subPoint('team1');
            }}
            className="px-2.5 py-2.5 bg-zinc-900 border border-zinc-850 text-[10px] font-bold text-orange-brand hover:bg-zinc-800 rounded-xl"
          >
            -1 Local
          </button>

          <button 
            onClick={() => {
              if (confirm('¿Restar un punto al equipo Visitante?')) subPoint('team2');
            }}
            className="px-2.5 py-2.5 bg-zinc-900 border border-zinc-850 text-[10px] font-bold text-purple-brand hover:bg-zinc-800 rounded-xl"
          >
            -1 Vis.
          </button>

          <button 
            onClick={() => setShowConfirmReset(true)}
            className="p-2.5 bg-zinc-900/50 border border-zinc-900/80 hover:bg-red-950/20 text-red-400 rounded-xl"
            title="Reiniciar"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* MODAL: TIMEOUT COUNTDOWN */}
      {timeoutCountdown !== null && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-6 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-3xl text-center max-w-xs w-full relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-brand to-purple-brand animate-pulse" />
            <span className="text-xs uppercase font-extrabold tracking-widest text-zinc-500 block mb-1">
              Tiempo Fuera solicitado por:
            </span>
            <span className={`text-lg font-black uppercase tracking-tight block mb-6 ${
              timeoutTeam === 'team1' ? 'text-orange-brand' : 'text-purple-brand'
            }`}>
              {timeoutTeam === 'team1' ? team1.name : team2.name}
            </span>
            <span className="text-7xl font-mono font-black text-white tracking-tighter block mb-6">
              {timeoutCountdown}
            </span>
            <button
              onClick={() => {
                setTimeoutCountdown(null);
                setTimeoutTeam(null);
              }}
              className="py-2.5 px-6 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-zinc-200 text-xs font-bold rounded-xl"
            >
              Saltar Cuenta Regresiva
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM SET WINNER & SIDE CHANGE */}
      {pendingSetWinner && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-6 backdrop-blur-md">
          <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-3xl text-center max-w-xs w-full relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-brand to-purple-brand animate-pulse" />
            <span className="text-3xl block mb-2">🏆</span>
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block mb-1">Set Concluido</span>
            <h3 className={`text-xl font-black uppercase mb-1 ${
              pendingSetWinner === 'team1' ? 'text-orange-brand' : 'text-purple-brand'
            }`}>
              Ganador del Set: {pendingSetWinner === 'team1' ? team1.name : team2.name}
            </h3>
            <span className="text-3xl font-mono font-extrabold text-white block mb-6">
              {score1} - {score2}
            </span>
            <p className="text-[10px] text-zinc-500 leading-relaxed mb-6">
              Por favor, realicen el cambio de lado físico de la cancha. Puedes reflejar este cambio en la pantalla usando el botón a continuación.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={swapSides}
                className="py-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-300 flex items-center justify-center gap-1.5 hover:bg-zinc-850"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-zinc-400" />
                Intercambiar Marcadores en Pantalla
              </button>
              <button
                onClick={confirmSetWinner}
                className="py-3 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-extrabold rounded-xl text-xs uppercase tracking-wider mt-2"
              >
                Comenzar Siguiente Set
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: MATCH FINISHED OVERLAY */}
      {matchWinnerId && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-6 backdrop-blur-lg">
          <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-3xl text-center max-w-xs w-full relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-brand to-purple-brand" />
            <span className="text-5xl block mb-3">🏐🏆</span>
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block mb-1">Partido Finalizado</span>
            <h3 className={`text-xl font-black uppercase mb-6 ${
              matchWinnerId === team1.id ? 'text-orange-brand' : 'text-purple-brand'
            }`}>
              ¡Ganador: {matchWinnerId === team1.id ? team1.name : team2.name}!
            </h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => {
                  if (tournamentId) navigate(`/admin/tournament/${tournamentId}/play`);
                  else navigate('/admin/dashboard');
                }}
                className="py-3 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-extrabold rounded-xl text-xs uppercase tracking-wider"
              >
                Volver al Torneo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM MATCH RESET */}
      {showConfirmReset && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-6 backdrop-blur-sm">
          <div className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl text-center max-w-xs w-full">
            <h4 className="text-sm font-bold text-white mb-2">¿Confirmas reiniciar el partido?</h4>
            <p className="text-[10px] text-zinc-500 leading-relaxed mb-6">
              Esta acción borrará todos los puntos y sets disputados del partido actual y comenzará de 0:0.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setShowConfirmReset(false)}
                className="flex-1 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-xs font-bold text-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  resetMatch();
                  setShowConfirmReset(false);
                }}
                className="flex-1 py-2 bg-red-650 text-white font-bold rounded-xl text-xs"
              >
                Reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
