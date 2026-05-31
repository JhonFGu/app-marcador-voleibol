import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  Volume2, VolumeX, ArrowLeft, Loader2, Activity
} from 'lucide-react';
import { supabase } from '../supabaseClient';

interface MatchData {
  id: string;
  tournament_id: string;
  team1_id: string;
  team2_id: string;
  court: number;
  status: 'pending' | 'in_progress' | 'finished';
  score_json?: any;
  team1?: { name: string };
  team2?: { name: string };
}

export default function PublicLiveMatch() {
  const { matchId } = useParams<{ matchId: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showRotations, setShowRotations] = useState(false);

  // References to track previous scores for sound trigger comparisons
  const prevScores = useRef<{ score1: number; score2: number; sets1: number; sets2: number }>({
    score1: 0,
    score2: 0,
    sets1: 0,
    sets2: 0
  });

  // Fetch initial match details
  useEffect(() => {
    if (matchId) {
      fetchMatchDetails();
    }
  }, [matchId]);

  const fetchMatchDetails = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('matches')
        .select('*, team1:teams!matches_team1_id_fkey(name), team2:teams!matches_team2_id_fkey(name)')
        .eq('id', matchId)
        .single();

      if (error) throw error;

      setMatchData(data);
      
      // Initialize previous score reference
      const saved = data.score_json || {};
      prevScores.current = {
        score1: saved.current_set?.team1 ?? 0,
        score2: saved.current_set?.team2 ?? 0,
        sets1: saved.sets_won?.team1 ?? 0,
        sets2: saved.sets_won?.team2 ?? 0
      };
    } catch (e) {
      console.error('Error fetching live match details:', e);
      alert('No se pudo encontrar la información de este partido.');
      navigate('/tournaments');
    } finally {
      setLoading(false);
    }
  };

  // Subscribe to Realtime Updates
  useEffect(() => {
    if (!matchId) return;

    const channel = supabase
      .channel(`spectator-match-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`
        },
        async (payload) => {
          console.log('Realtime update received:', payload.new);
          
          // Re-fetch or merge team names
          const newRecord = payload.new as MatchData;
          
          setMatchData(prev => {
            if (!prev) return prev;
            const updated = {
              ...prev,
              status: newRecord.status,
              score_json: newRecord.score_json
            };

            // Trigger immersive sound alerts
            const saved = newRecord.score_json || {};
            const next1 = saved.current_set?.team1 ?? 0;
            const next2 = saved.current_set?.team2 ?? 0;
            const s1 = saved.sets_won?.team1 ?? 0;
            const s2 = saved.sets_won?.team2 ?? 0;

            const prevRef = prevScores.current;

            // 1. Check set win (whistle)
            if (saved.pendingSetWinner && (saved.pendingSetWinner !== prevRef.score1 || saved.pendingSetWinner !== prevRef.score2)) {
              playAudio('whistle');
            }
            // 2. Check match win (buzzer)
            else if (newRecord.status === 'finished' && prev.status !== 'finished') {
              playAudio('buzzer');
            }
            // 3. Check point add (beep)
            else if (next1 > prevRef.score1 || next2 > prevRef.score2) {
              playAudio('beep');
            }

            // Update ref
            prevScores.current = {
              score1: next1,
              score2: next2,
              sets1: s1,
              sets2: s2
            };

            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [matchId]);

  // Audio synthesizer
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
      console.warn("AudioContext failed", e);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  if (loading || !matchData) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white font-sans">
        <Loader2 className="w-6 h-6 animate-spin text-orange-brand" />
      </div>
    );
  }

  const live = matchData.score_json || {};
  const currentSet = live.current_set || { team1: 0, team2: 0 };
  const setsWon = live.sets_won || { team1: 0, team2: 0 };
  const prevSets = live.sets || [];
  const servingTeam = live.serving_team;
  const courtPositions1 = live.courtPositions1 || [1, 2, 3, 4, 5, 6];
  const courtPositions2 = live.courtPositions2 || [1, 2, 3, 4, 5, 6];
  const timeouts1 = live.timeouts1 || 0;
  const timeouts2 = live.timeouts2 || 0;
  const pendingSetWinner = live.pendingSetWinner;
  const winnerId = live.winner_id;

  const leftTeamName = matchData.team1?.name || 'Local';
  const rightTeamName = matchData.team2?.name || 'Visitante';
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
      const showBall = isLeft ? servingTeam === 'team1' : servingTeam === 'team2';

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
            Rotaciones en Juego (Red al Centro)
          </span>
          <div className="grid grid-cols-2 gap-3 relative">
            <div className="absolute top-0 bottom-0 left-1/2 -ml-[1px] border-l-2 border-dashed border-zinc-700 z-10 pointer-events-none" />

            {/* Left Court (Orange) */}
            <div className="bg-orange-brand/5 border border-orange-brand/15 p-2 rounded-xl flex flex-col gap-1.5 relative">
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(courtPositions1, 4, "Pos 5 (Zag L)", true)}
                {renderPlayerSlot(courtPositions1, 3, "Pos 4 (Fre L)", true)}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(courtPositions1, 5, "Pos 6 (Zag C)", true)}
                {renderPlayerSlot(courtPositions1, 2, "Pos 3 (Fre C)", true)}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(courtPositions1, 0, "Pos 1 (Saque)", true)}
                {renderPlayerSlot(courtPositions1, 1, "Pos 2 (Fre R)", true)}
              </div>
            </div>

            {/* Right Court (Purple) */}
            <div className="bg-purple-brand/5 border border-purple-brand/15 p-2 rounded-xl flex flex-col gap-1.5 relative">
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(courtPositions2, 1, "Pos 2 (Fre R)", false)}
                {renderPlayerSlot(courtPositions2, 0, "Pos 1 (Saque)", false)}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(courtPositions2, 2, "Pos 3 (Fre C)", false)}
                {renderPlayerSlot(courtPositions2, 5, "Pos 6 (Zag C)", false)}
              </div>
              <div className="grid grid-cols-2 gap-1.5 text-center">
                {renderPlayerSlot(courtPositions2, 3, "Pos 4 (Fre L)", false)}
                {renderPlayerSlot(courtPositions2, 4, "Pos 5 (Zag L)", false)}
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
          onClick={() => navigate(`/tournament/${matchData.tournament_id}`)}
          className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors flex items-center gap-1 text-xs font-bold text-gray-300"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Volver
        </button>

        <span className="text-[10px] text-zinc-500 font-black tracking-widest uppercase flex items-center gap-1.5">
          {matchData.status === 'in_progress' ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
              MARCADOR EN VIVO 🔴
            </>
          ) : (
            'PARTIDO FINALIZADO'
          )}
        </span>

        {/* Dynamic Timer Badge */}
        <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-mono font-bold transition-all ${
          matchData.status === 'in_progress'
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-500'
            : 'bg-zinc-900 border-zinc-800 text-zinc-500'
        }`}>
          {formatTime(live.duration_seconds || 0)}
        </span>
      </div>

      {/* 2. MATCH INFO */}
      <div className="bg-zinc-950/30 border-b border-zinc-900 px-4 py-1.5 text-center flex items-center justify-center gap-3 text-[10px] font-bold text-gray-400 z-10">
        <span>Cancha {matchData.court}</span>
        <span>•</span>
        {prevSets.length > 0 && (
          <span className="text-zinc-500">
            Sets: {prevSets.map((s: any, i: number) => `(S${i+1}: ${s.team1}-${s.team2})`).join(' ')}
          </span>
        )}
      </div>

      {/* 3. SCORE PANELS */}
      <div className="flex-grow grid grid-cols-2 relative">
        {/* Left Side: Local (Orange) */}
        <div className="relative bg-orange-brand flex flex-col justify-between p-4 border-r border-zinc-900">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-white uppercase">
              {leftTeamName}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-white/70">SETS:</span>
              <span className="text-2xl font-black font-mono text-white">{setsWon.team1}</span>
            </div>
          </div>

          <div className="my-auto text-center flex flex-col justify-center">
            <span className="text-[7.5rem] xs:text-[9.5rem] sm:text-[11rem] md:text-[13rem] font-bold font-digital text-white tracking-tighter block leading-none digital-glow-white">
              {currentSet.team1.toString().padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="px-3 py-2 bg-white/10 border border-white/20 text-[10px] font-semibold text-white rounded-xl">
              Tiempos Fuera: {timeouts1}/2
            </span>
            {servingTeam === 'team1' && (
              <span className="px-3 py-2 bg-white border border-white text-orange-brand text-[10px] font-extrabold rounded-xl flex items-center gap-1">
                🏐 Al Saque
              </span>
            )}
          </div>
        </div>

        {/* Right Side: Visitor (Purple) */}
        <div className="relative bg-purple-brand flex flex-col justify-between p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black tracking-tight text-white uppercase">
              {rightTeamName}
            </h2>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-white/70">SETS:</span>
              <span className="text-2xl font-black font-mono text-white">{setsWon.team2}</span>
            </div>
          </div>

          <div className="my-auto text-center flex flex-col justify-center">
            <span className="text-[7.5rem] xs:text-[9.5rem] sm:text-[11rem] md:text-[13rem] font-bold font-digital text-white tracking-tighter block leading-none digital-glow-white">
              {currentSet.team2.toString().padStart(2, '0')}
            </span>
          </div>

          <div className="flex items-center justify-between">
            <span className="px-3 py-2 bg-white/10 border border-white/20 text-[10px] font-semibold text-white rounded-xl">
              Tiempos Fuera: {timeouts2}/2
            </span>
            {servingTeam === 'team2' && (
              <span className="px-3 py-2 bg-white border border-white text-purple-brand text-[10px] font-extrabold rounded-xl flex items-center gap-1">
                🏐 Al Saque
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 4. CANCHA rotation layout */}
      {showRotations && renderCourtGrid()}

      {/* 5. BOTTOM SPECTATOR TOOLBAR */}
      <div className="px-4 py-3 border-t border-zinc-900 bg-zinc-950/60 flex items-center justify-between gap-2 z-10">
        <span className="text-[10px] text-zinc-500 font-bold flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 text-orange-brand animate-pulse" />
          Sincronizado en tiempo real
        </span>

        <div className="flex items-center gap-1.5">
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
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2.5 bg-zinc-900 border border-zinc-850 text-zinc-450 hover:text-zinc-200 rounded-xl transition-colors"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* MODAL: TIMEOUT COUNTDOWN */}
      {timeouts1 + timeouts2 > 0 && false && (
        <div className="fixed inset-0 bg-black/85 flex items-center justify-center z-50 p-6 backdrop-blur-sm">
          {/* Spectators see a static layout or popup if active */}
        </div>
      )}

      {/* MODAL: SET CONCLUDED OVERLAY */}
      {pendingSetWinner && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-6 backdrop-blur-md">
          <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-3xl text-center max-w-xs w-full relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-brand to-purple-brand animate-pulse" />
            <span className="text-3xl block mb-2">🏆</span>
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block mb-1">Set Concluido</span>
            <h3 className={`text-xl font-black uppercase mb-1 ${
              pendingSetWinner === 'team1' ? 'text-orange-brand' : 'text-purple-brand'
            }`}>
              Ganador del Set: {pendingSetWinner === 'team1' ? leftTeamName : rightTeamName}
            </h3>
            <span className="text-3xl font-mono font-extrabold text-white block mb-4">
              {currentSet.team1} - {currentSet.team2}
            </span>
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              Esperando a que el árbitro inicie el próximo set...
            </p>
          </div>
        </div>
      )}

      {/* MODAL: MATCH FINISHED OVERLAY */}
      {winnerId && (
        <div className="fixed inset-0 bg-black/95 flex items-center justify-center z-50 p-6 backdrop-blur-lg">
          <div className="bg-zinc-950 border border-zinc-900 p-8 rounded-3xl text-center max-w-xs w-full relative overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-brand to-purple-brand" />
            <span className="text-5xl block mb-3">🏐🏆</span>
            <span className="text-[10px] font-black uppercase text-zinc-500 tracking-widest block mb-1">Partido Finalizado</span>
            <h3 className={`text-xl font-black uppercase mb-6 ${
              winnerId === matchData.team1_id ? 'text-orange-brand' : 'text-purple-brand'
            }`}>
              ¡Ganador: {winnerId === matchData.team1_id ? leftTeamName : rightTeamName}!
            </h3>
            <button
              onClick={() => navigate(`/tournament/${matchData.tournament_id}`)}
              className="w-full py-3 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-extrabold rounded-xl text-xs uppercase tracking-wider"
            >
              Volver al Torneo
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
