import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Undo, Redo, Volume2, VolumeX, 
  Play, Pause, ArrowLeftRight, Settings, RotateCcw 
} from 'lucide-react';
import { useMatchStore } from '../store/matchStore';

export default function MatchScoreboard() {
  const navigate = useNavigate();
  const {
    team1, team2, score1, score2, sets1, sets2,
    setHistory, servingTeam, timeouts1, timeouts2,
    isPaused, durationSeconds, courtPositions1, courtPositions2,
    isConfigured, swappedSides, matchWinnerId, pendingSetWinner,
    initMatch, addPoint, subPoint, setServe, useTimeout,
    togglePause, incrementTimer, undo, redo, resetMatch, swapSides, confirmSetWinner
  } = useMatchStore();

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [timeoutCountdown, setTimeoutCountdown] = useState<number | null>(null);
  const [timeoutTeam, setTimeoutTeam] = useState<'team1' | 'team2' | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showRotations, setShowRotations] = useState(false);
  
  // Track landscape/portrait state dynamically for optimized layouts
  const [isLandscape, setIsLandscape] = useState(window.innerWidth > window.innerHeight);

  useEffect(() => {
    const handleResize = () => {
      setIsLandscape(window.innerWidth > window.innerHeight);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Load configuration from localStorage if store not configured
  useEffect(() => {
    if (!isConfigured) {
      const stored = localStorage.getItem('volley_local_match_setup');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          initMatch(parsed.team1, parsed.team2, parsed.config);
        } catch (e) {
          navigate('/match/setup');
        }
      } else {
        navigate('/match/setup');
      }
    }
  }, [isConfigured, initMatch, navigate]);

  // Duration Timer Interval
  useEffect(() => {
    const interval = setInterval(() => {
      incrementTimer();
    }, 1000);
    return () => clearInterval(interval);
  }, [incrementTimer]);

  // Timeout Countdown Timer
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

  // Play audio alerts upon set events (whistle on set wins)
  useEffect(() => {
    if (pendingSetWinner) {
      playAudio('whistle');
    }
  }, [pendingSetWinner]);

  // Synthesize game sounds using Web Audio API (100% offline, zero assets)
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
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 note
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
      } else if (type === 'whistle') {
        osc.type = 'sine';
        // Classic referee whistle is a high pitch warble
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

  if (!isConfigured) {
    return <div className="min-h-screen bg-black flex items-center justify-center text-white">Cargando...</div>;
  }

  // Format Duration seconds into MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Helper to trigger point add
  const handleScoreTap = (team: 'team1' | 'team2') => {
    if (isPaused) {
      togglePause(); // Auto resume when points change
    }
    playAudio('beep');
    addPoint(team);
  };

  const handleTimeoutClick = (team: 'team1' | 'team2') => {
    const isTeam1 = team === 'team1';
    const current = isTeam1 ? timeouts1 : timeouts2;
    if (current >= 2) return; // limit reached

    playAudio('whistle');
    useTimeout(team);
    setTimeoutCountdown(30);
    setTimeoutTeam(team);
  };

  // Side assignments
  // Left Side is Orange by default, Right Side is Purple
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
          <span className="text-[10px] text-zinc-550 uppercase tracking-widest block text-center mb-2">
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
      
      {/* 1. TOP HEADER / CONTROL PANEL */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-900 bg-zinc-950/60 backdrop-blur-md z-10">
        <button
          onClick={() => navigate('/match/setup')}
          className="p-1.5 text-gray-400 hover:text-white"
        >
          <Settings className="w-5 h-5" />
        </button>

        {/* Dynamic Timer Badge */}
        <div className="flex items-center gap-2">
          {/* Left timeouts indicators */}
          <div className="flex gap-1">
            {[1, 2].map((i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${
                  leftTimeouts >= i ? 'bg-orange-brand animate-pulse' : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center bg-zinc-900 border border-zinc-800 px-4 py-1.5 rounded-full shadow-inner">
            <span className="font-digital text-lg tracking-wider font-semibold text-zinc-300">
              {formatTime(durationSeconds)}
            </span>
            <button
              onClick={() => {
                playAudio('beep');
                togglePause();
              }}
              className="ml-2.5 p-1 rounded-full bg-zinc-800 text-zinc-300 hover:text-white"
            >
              {isPaused ? <Play className="w-3.5 h-3.5 fill-current" /> : <Pause className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* Right timeouts indicators */}
          <div className="flex gap-1">
            {[1, 2].map((i) => (
              <span
                key={i}
                className={`w-2 h-2 rounded-full ${
                  rightTimeouts >= i ? 'bg-purple-brand animate-pulse' : 'bg-zinc-800'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Audio Mute button */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          className="p-1.5 text-gray-400 hover:text-white"
        >
          {soundEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5 text-zinc-600" />}
        </button>
      </div>
      {/* 2. RESPONSIVE SCOREBOARD AREA */}
      {isLandscape ? (
        /* LANDSCAPE LAYOUT (Scoreboards on sides, details in center) */
        <div className="flex flex-row flex-grow justify-between p-4 gap-4 relative z-0">
          {/* LEFT SCOREBOARD CARD (ORANGE) */}
          <div className="flex-1 flex flex-col justify-center items-center rounded-3xl bg-orange-brand hover:bg-orange-brand/90 transition-all p-6 relative overflow-hidden border border-orange-500/30">
            <div className="flex items-center gap-2 mb-2">
              {servingTeam === leftTeamKey && (
                <span className="flex items-center justify-center w-5 h-5 bg-white text-orange-brand rounded-full text-[10px] font-black animate-bounce shadow">
                  🏐
                </span>
              )}
              <h2 className="text-xl font-bold tracking-wide text-white uppercase">{leftTeamName}</h2>
            </div>
            <div
              onClick={() => handleScoreTap(leftTeamKey)}
              className="w-full max-w-[240px] aspect-[4/3] flex items-center justify-center bg-white/10 border border-white/20 rounded-2xl cursor-pointer hover:border-white/50 transition-all select-none shadow-2xl active:scale-[0.97]"
            >
              <span className="font-digital text-9xl md:text-[10rem] lg:text-[12rem] leading-none text-white font-bold select-none digital-glow-white">
                {leftScore.toString().padStart(2, '0')}
              </span>
            </div>
            <button
              onClick={() => {
                playAudio('beep');
                subPoint(leftTeamKey);
              }}
              disabled={leftScore === 0}
              className="mt-4 px-6 py-1.5 rounded-full bg-white/15 border border-white/25 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-40"
            >
              - Restar Punto
            </button>
            <button
              onClick={() => handleTimeoutClick(leftTeamKey)}
              disabled={leftTimeouts >= 2}
              className="mt-2 text-[10px] font-bold text-white/80 hover:text-white disabled:opacity-30"
            >
              Pedir Tiempo ({leftTimeouts}/2)
            </button>
          </div>

          {/* CENTER PANEL */}
          <div className="w-48 flex flex-col justify-center items-center gap-4 bg-zinc-950/20 border-x border-zinc-900 px-2">
            <div className="text-center">
              <span className="text-xs text-zinc-500 uppercase tracking-widest block mb-1">SETS</span>
              <div className="flex items-center gap-3 bg-zinc-900/60 border border-zinc-850 px-4 py-2 rounded-2xl">
                <span className="font-digital text-3xl font-extrabold text-orange-brand digital-glow-orange">{leftSets}</span>
                <span className="text-zinc-600 font-bold">:</span>
                <span className="font-digital text-3xl font-extrabold text-purple-brand digital-glow-purple">{rightSets}</span>
              </div>
            </div>
            {setHistory.length > 0 && (
              <div className="flex flex-col items-center max-w-[150px]">
                <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">Historial</span>
                <div className="flex flex-col gap-1 w-full bg-zinc-950 border border-zinc-900 p-2 rounded-xl text-center">
                  {setHistory.map((score, idx) => (
                    <div key={idx} className="text-xs flex justify-between gap-3 text-zinc-400 font-mono">
                      <span className="text-zinc-600">S{idx + 1}</span>
                      <span>
                        {swappedSides ? score.team2Points : score.team1Points} - {swappedSides ? score.team1Points : score.team2Points}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex items-center gap-2 mt-2">
              <button onClick={undo} className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:text-white"><Undo className="w-4 h-4 text-gray-400" /></button>
              <button onClick={redo} className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:text-white"><Redo className="w-4 h-4 text-gray-400" /></button>
              <button onClick={swapSides} className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:text-white"><ArrowLeftRight className="w-4 h-4 text-gray-400" /></button>
              <button
                onClick={() => {
                  playAudio('beep');
                  setServe(servingTeam === 'team1' ? 'team2' : 'team1');
                }}
                className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-gray-400"
              >
                SAQ
              </button>
            </div>
          </div>

          {/* RIGHT SCOREBOARD CARD (PURPLE) */}
          <div className="flex-1 flex flex-col justify-center items-center rounded-3xl bg-purple-brand hover:bg-purple-brand/90 transition-all p-6 relative overflow-hidden border border-purple-500/30">
            <div className="flex items-center gap-2 mb-2">
              {servingTeam === rightTeamKey && (
                <span className="flex items-center justify-center w-5 h-5 bg-white text-purple-brand rounded-full text-[10px] font-black animate-bounce shadow">
                  🏐
                </span>
              )}
              <h2 className="text-xl font-bold tracking-wide text-white uppercase">{rightTeamName}</h2>
            </div>
            <div
              onClick={() => handleScoreTap(rightTeamKey)}
              className="w-full max-w-[240px] aspect-[4/3] flex items-center justify-center bg-white/10 border border-white/20 rounded-2xl cursor-pointer hover:border-white/50 transition-all select-none shadow-2xl active:scale-[0.97]"
            >
              <span className="font-digital text-9xl md:text-[10rem] lg:text-[12rem] leading-none text-white font-bold select-none digital-glow-purple">
                {rightScore.toString().padStart(2, '0')}
              </span>
            </div>
            <button
              onClick={() => {
                playAudio('beep');
                subPoint(rightTeamKey);
              }}
              disabled={rightScore === 0}
              className="mt-4 px-6 py-1.5 rounded-full bg-white/15 border border-white/25 text-xs font-semibold text-white hover:bg-white/25 disabled:opacity-40"
            >
              - Restar Punto
            </button>
            <button
              onClick={() => handleTimeoutClick(rightTeamKey)}
              disabled={rightTimeouts >= 2}
              className="mt-2 text-[10px] font-bold text-white/80 hover:text-white disabled:opacity-30"
            >
              Pedir Tiempo ({rightTimeouts}/2)
            </button>
          </div>
        </div>
      ) : (
        /* PORTRAIT LAYOUT: SCORECARDS SIDE-BY-SIDE AT SAME HEIGHT FOR MOBILE EASY USE */
        <div className="flex flex-col flex-grow p-3 gap-3 relative z-0 justify-start">
          {/* Side-by-side Scoreboards */}
          <div className="grid grid-cols-2 gap-3 w-full items-stretch">
            {/* LEFT SCOREBOARD CARD (ORANGE) */}
            <div className="flex flex-col items-center justify-between rounded-2xl bg-orange-brand hover:bg-orange-brand/95 transition-all p-3 pb-4 relative overflow-hidden border border-orange-500/30">
              <div className="absolute top-0 left-0 right-0 h-1 bg-orange-brand" />
              
              <div className="flex items-center gap-1.5 mb-2.5 w-full justify-center">
                {servingTeam === leftTeamKey && (
                  <span className="flex items-center justify-center w-4.5 h-4.5 bg-white text-orange-brand rounded-full text-[9px] font-black animate-bounce shadow">
                    🏐
                  </span>
                )}
                <h2 className="text-sm font-black tracking-wide text-white truncate uppercase max-w-[80%]">{leftTeamName}</h2>
              </div>

              {/* Tappable score card */}
              <div
                onClick={() => handleScoreTap(leftTeamKey)}
                className="w-full h-44 xs:h-52 flex items-center justify-center bg-white/10 border border-white/20 rounded-xl cursor-pointer hover:border-white/50 transition-all select-none active:scale-[0.96]"
              >
                <span className="font-digital text-[6.5rem] xs:text-[8rem] font-bold text-white select-none leading-none tracking-tighter digital-glow-white">
                  {leftScore.toString().padStart(2, '0')}
                </span>
              </div>

              {/* Score adjustments and timeouts */}
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
                <button
                  onClick={() => handleTimeoutClick(leftTeamKey)}
                  disabled={leftTimeouts >= 2}
                  className="text-sm font-bold text-white/80 hover:text-white disabled:opacity-30 mt-1"
                >
                  Tiempo ({leftTimeouts}/2)
                </button>
              </div>
            </div>

            {/* RIGHT SCOREBOARD CARD (PURPLE) */}
            <div className="flex flex-col items-center justify-between rounded-2xl bg-purple-brand hover:bg-purple-brand/95 transition-all p-3 pb-4 relative overflow-hidden border border-purple-500/30">
              <div className="absolute top-0 left-0 right-0 h-1 bg-purple-brand" />

              <div className="flex items-center gap-1.5 mb-2.5 w-full justify-center">
                {servingTeam === rightTeamKey && (
                  <span className="flex items-center justify-center w-4.5 h-4.5 bg-white text-purple-brand rounded-full text-[9px] font-black animate-bounce shadow">
                    🏐
                  </span>
                )}
                <h2 className="text-sm font-black tracking-wide text-white truncate uppercase max-w-[80%]">{rightTeamName}</h2>
              </div>

              {/* Tappable score card */}
              <div
                onClick={() => handleScoreTap(rightTeamKey)}
                className="w-full h-44 xs:h-52 flex items-center justify-center bg-white/10 border border-white/20 rounded-xl cursor-pointer hover:border-white/50 transition-all select-none active:scale-[0.96]"
              >
                <span className="font-digital text-[6.5rem] xs:text-[8rem] font-bold text-white select-none leading-none tracking-tighter digital-glow-white">
                  {rightScore.toString().padStart(2, '0')}
                </span>
              </div>

              {/* Score adjustments and timeouts */}
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
                <button
                  onClick={() => handleTimeoutClick(rightTeamKey)}
                  disabled={rightTimeouts >= 2}
                  className="text-sm font-bold text-white/80 hover:text-white disabled:opacity-30 mt-1"
                >
                  Tiempo ({rightTimeouts}/2)
                </button>
              </div>
            </div>
          </div>

          {/* Sets and History display in a compact horizontal bar */}
          <div className="flex items-center justify-between bg-zinc-950/60 border border-zinc-900/80 p-3 rounded-xl gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-zinc-550 font-bold uppercase tracking-wider">SETS:</span>
              <div className="flex items-center gap-1.5 bg-zinc-900 border border-zinc-850 px-2.5 py-1 rounded-lg">
                <span className="font-digital text-sm font-black text-orange-brand">{leftSets}</span>
                <span className="text-zinc-650 text-xs font-bold">:</span>
                <span className="font-digital text-sm font-black text-purple-brand">{rightSets}</span>
              </div>
            </div>
            
            {/* Horizontal Set Log */}
            {setHistory.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto max-w-[60%]">
                {setHistory.map((score, idx) => (
                  <span key={idx} className="text-sm bg-zinc-900 border border-zinc-850 px-2 py-0.5 rounded text-zinc-400 font-mono shrink-0">
                    S{idx + 1}: {swappedSides ? score.team2Points : score.team1Points}-{swappedSides ? score.team1Points : score.team2Points}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Quick controls bar */}
          <div className="flex items-center justify-around bg-zinc-950/80 border border-zinc-900 p-2.5 rounded-xl">
            <button onClick={undo} className="p-2 bg-zinc-900 border border-zinc-850 rounded-xl hover:text-white text-zinc-400"><Undo className="w-4.5 h-4.5" /></button>
            <button onClick={redo} className="p-2 bg-zinc-900 border border-zinc-850 rounded-xl hover:text-white text-zinc-400"><Redo className="w-4.5 h-4.5" /></button>
            <button onClick={swapSides} className="p-2 bg-zinc-900 border border-zinc-850 rounded-xl hover:text-white text-zinc-400"><ArrowLeftRight className="w-4.5 h-4.5" /></button>
            <button
              onClick={() => setShowRotations(!showRotations)}
              className={`px-3 py-2 border rounded-xl text-xs font-bold transition-all ${
                showRotations 
                  ? 'bg-orange-brand/20 border-orange-brand text-orange-brand' 
                  : 'bg-zinc-900 border-zinc-850 text-gray-450 hover:text-white'
              }`}
            >
              Rotación {showRotations ? '▼' : '▲'}
            </button>
            <button
              onClick={() => {
                playAudio('beep');
                setServe(servingTeam === 'team1' ? 'team2' : 'team1');
              }}
              className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-xs font-bold text-gray-450 hover:text-white"
            >
              SAQUE
            </button>
          </div>
        </div>
      )}

      {/* 3. ROTATIONS COURT GRID (ONLY FOR 6v6) */}
      {showRotations && renderCourtGrid()}

      {/* BOTTOM ACTION BAR */}
      <div className="mt-auto p-4 border-t border-zinc-900 bg-zinc-950 flex items-center justify-around">
        <button
          onClick={() => setShowConfirmReset(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-red-500 hover:bg-zinc-800"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Reiniciar
        </button>

        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-gray-400 hover:text-white"
        >
          Salir
        </button>
      </div>

      {/* OVERLAY: TIMEOUT COUNTDOWN */}
      {timeoutCountdown !== null && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center z-50 animate-fade-in p-6 text-center select-none">
          <div className={`p-4 rounded-full mb-6 ${
            timeoutTeam === 'team1' ? 'bg-orange-brand/10 text-orange-brand' : 'bg-purple-brand/10 text-purple-brand'
          }`}>
            <span className="text-4xl">⏱️</span>
          </div>
          <h2 className="text-2xl font-bold uppercase tracking-widest text-zinc-400">
            Tiempo Fuera
          </h2>
          <p className="text-lg font-semibold mt-1">
            {timeoutTeam === 'team1' ? team1.name : team2.name}
          </p>
          <div className="font-digital text-8xl font-black my-8 tracking-wider digital-glow-white">
            {timeoutCountdown}s
          </div>
          <button
            onClick={() => {
              playAudio('beep');
              setTimeoutCountdown(null);
              setTimeoutTeam(null);
            }}
            className="px-8 py-3 rounded-2xl bg-zinc-900 border border-zinc-800 text-sm font-bold text-gray-300 hover:text-white"
          >
            Reanudar Juego
          </button>
        </div>
      )}

      {/* OVERLAY: RESET CONFIRMATION */}
      {showConfirmReset && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <div className="bg-zinc-950 border border-zinc-800 p-6 rounded-3xl max-w-xs w-full text-center">
            <h3 className="text-lg font-bold text-white mb-2">¿Reiniciar partido?</h3>
            <p className="text-xs text-gray-400 mb-6">Esta acción borrará el marcador actual, el historial de sets y el cronómetro.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowConfirmReset(false)}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-semibold text-gray-400"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  playAudio('whistle');
                  resetMatch();
                  setShowConfirmReset(false);
                }}
                className="flex-1 py-2.5 rounded-xl bg-red-650 text-white font-bold text-xs"
              >
                Reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY: FLOATING SET WIN DIALOG (Solucion cambio de cancha y aceptar comenzar siguiente set) */}
      {pendingSetWinner !== null && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-6 text-center animate-fade-in">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-brand to-purple-brand rounded-full blur-xl opacity-40 animate-pulse" />
            <div className="relative bg-zinc-900 border border-zinc-800 p-6 rounded-full text-3xl">
              🎉
            </div>
          </div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">¡SET FINALIZADO!</span>
          <h2 className="text-2xl font-extrabold text-white mb-2">
            {pendingSetWinner === 'team1' ? team1.name : team2.name} gana el Set
          </h2>
          <p className="text-xs text-gray-400 mb-6 max-w-xs px-4">
            Se solicita a los equipos realizar el **cambio de lado de la cancha** si es necesario.
          </p>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={() => {
                playAudio('beep');
                swapSides();
              }}
              className="flex items-center justify-center gap-2 w-full py-3 bg-zinc-900 border border-zinc-800 text-gray-300 font-bold rounded-2xl hover:bg-zinc-800"
            >
              <ArrowLeftRight className="w-4 h-4" />
              Cambiar Lado (Pantalla)
            </button>
            <button
              onClick={() => {
                playAudio('whistle');
                confirmSetWinner();
              }}
              className="w-full py-4 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-bold rounded-2xl hover:opacity-90 active:scale-[0.98]"
            >
              Comenzar Siguiente Set
            </button>
          </div>
        </div>
      )}

      {/* OVERLAY: MATCH WINNER / GAME OVER */}
      {matchWinnerId !== null && (
        <div className="fixed inset-0 bg-black/95 flex flex-col items-center justify-center z-45 p-6 text-center animate-fade-in">
          <div className="relative mb-6">
            <div className="absolute inset-0 bg-gradient-to-tr from-orange-brand to-purple-brand rounded-full blur-xl opacity-40 animate-pulse" />
            <div className="relative bg-zinc-900 border border-zinc-800 p-6 rounded-full">
              <span className="text-5xl">🏆</span>
            </div>
          </div>
          <span className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1">¡PARTIDO FINALIZADO!</span>
          <h2 className="text-3xl font-extrabold text-white mb-6">
            {matchWinnerId === team1.id ? team1.name : team2.name} gana el encuentro
          </h2>

          <div className="bg-zinc-900 border border-zinc-800/60 p-4 rounded-2xl max-w-xs w-full mb-8 text-center font-mono">
            <span className="text-xs text-gray-500 block mb-2 font-sans uppercase tracking-wider">Marcador Final</span>
            <div className="flex justify-center items-center gap-3 text-lg font-bold text-white mb-2">
              <span>{sets1}</span>
              <span className="text-zinc-600">:</span>
              <span>{sets2}</span>
            </div>
            <div className="flex flex-col gap-1 text-xs text-gray-400">
              {setHistory.map((score, idx) => (
                <div key={idx} className="flex justify-between px-4">
                  <span className="text-zinc-600 font-sans">Set {idx + 1}</span>
                  <span>{score.team1Points} - {score.team2Points}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 w-full max-w-xs">
            <button
              onClick={() => {
                playAudio('whistle');
                resetMatch();
              }}
              className="w-full py-3.5 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-bold rounded-2xl hover:opacity-90 active:scale-[0.98]"
            >
              Jugar de Nuevo
            </button>
            <button
              onClick={() => {
                navigate('/');
              }}
              className="w-full py-3 bg-zinc-900 border border-zinc-800 text-gray-300 font-bold rounded-2xl hover:bg-zinc-800 active:scale-[0.98]"
            >
              Volver al Inicio
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
