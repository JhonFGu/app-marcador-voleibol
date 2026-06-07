import { Play, Trophy, Minus } from 'lucide-react';

interface Match {
  id: string;
  team1_id: string;
  team2_id: string;
  court: number;
  status: 'pending' | 'in_progress' | 'finished';
  round: number;
  group_name?: string;
  scheduled_time?: string;
  score_json?: any;
  team1?: { name: string };
  team2?: { name: string };
  bracket_position?: number;
}

interface Team {
  id: string;
  name: string;
}

interface PlayoffBracketProps {
  matches: Match[];
  teams: Team[];
  onStartMatch?: (matchId: string) => void;
  isAdmin?: boolean;
  tournamentActive?: boolean;
}

export default function PlayoffBracket({ matches, teams, onStartMatch, isAdmin = false, tournamentActive = true }: PlayoffBracketProps) {
  // Group knockout matches by round
  const knockoutMatches = matches
    .filter(m => m.group_name && !m.group_name.startsWith('Grupo'))
    .sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      return (a.score_json?.bracket_position ?? a.bracket_position ?? 0) - (b.score_json?.bracket_position ?? b.bracket_position ?? 0);
    });

  if (knockoutMatches.length === 0) {
    return (
      <div className="p-8 border border-zinc-900 border-dashed rounded-3xl text-center text-zinc-500 text-xs">
        Aún no se ha generado la fase de eliminación directa.
      </div>
    );
  }

  // Group by round
  const rounds: { [round: number]: Match[] } = {};
  knockoutMatches.forEach(m => {
    if (!rounds[m.round]) rounds[m.round] = [];
    rounds[m.round].push(m);
  });

  const roundKeys = Object.keys(rounds).map(Number).sort((a, b) => a - b);
  const teamMap: { [id: string]: string } = {};
  teams.forEach(t => { teamMap[t.id] = t.name; });

  const getTeamName = (teamId: string): string => {
    if (!teamId || teamId === '') return 'Por definir';
    return teamMap[teamId] || 'Por definir';
  };

  const isTeamTBD = (teamId: string): boolean => {
    return !teamId || teamId === '';
  };

  const getRoundLabel = (round: number): string => {
    const firstMatch = rounds[round]?.[0];
    return firstMatch?.group_name || `Ronda ${round}`;
  };

  // Find the champion
  const finalRound = roundKeys[roundKeys.length - 1];
  const finalMatch = rounds[finalRound]?.[0];
  const champion = finalMatch?.status === 'finished' && finalMatch.score_json?.winner_id
    ? finalMatch.score_json.winner_id
    : null;

  return (
    <div className="flex flex-col gap-6">
      {/* Champion banner */}
      {champion && (
        <div className="p-4 bg-gradient-to-r from-amber-500/10 to-yellow-500/10 border border-amber-500/30 rounded-2xl text-center flex flex-col items-center gap-2 animate-pulse">
          <Trophy className="w-8 h-8 text-amber-400" />
          <span className="text-lg font-black text-amber-300 uppercase tracking-wider">
            🏆 ¡Campeón!
          </span>
          <span className="text-xl font-black text-white">
            {getTeamName(champion)}
          </span>
        </div>
      )}

      {/* Bracket - vertical layout for mobile */}
      <div className="flex flex-col gap-4">
        {roundKeys.map((roundNum, roundIdx) => {
          const roundMatches = rounds[roundNum];
          const roundLabel = getRoundLabel(roundNum);
          const isFinal = roundIdx === roundKeys.length - 1;

          return (
            <div key={roundNum} className="flex flex-col gap-3">
              {/* Round header */}
              <div className="flex items-center gap-2">
                <div className={`h-px flex-grow ${isFinal ? 'bg-gradient-to-r from-amber-500/40 to-transparent' : 'bg-zinc-800'}`} />
                <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full border ${
                  isFinal
                    ? 'text-amber-400 border-amber-500/30 bg-amber-500/5'
                    : 'text-zinc-400 border-zinc-800 bg-zinc-900/40'
                }`}>
                  {roundLabel}
                </span>
                <div className={`h-px flex-grow ${isFinal ? 'bg-gradient-to-l from-amber-500/40 to-transparent' : 'bg-zinc-800'}`} />
              </div>

              {/* Matches in this round */}
              <div className={`grid gap-3 ${roundMatches.length > 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {roundMatches.map((m) => {
                  const score = m.score_json || {};
                  const setsWon = score.sets_won || { team1: 0, team2: 0 };
                  const prevSets = score.sets || [];
                  const winnerId = score.winner_id;
                  const t1TBD = isTeamTBD(m.team1_id);
                  const t2TBD = isTeamTBD(m.team2_id);
                  const bothTeamsReady = !t1TBD && !t2TBD;
                  const canPlay = bothTeamsReady && m.status !== 'finished' && isAdmin && tournamentActive;

                  return (
                    <div
                      key={m.id}
                      className={`rounded-2xl border overflow-hidden transition-all ${
                        isFinal
                          ? m.status === 'in_progress'
                            ? 'border-amber-500/50 bg-zinc-950 shadow-lg shadow-amber-500/10'
                            : 'border-amber-500/20 bg-zinc-950/80'
                          : m.status === 'in_progress'
                            ? 'border-orange-brand/50 bg-zinc-950 shadow-md shadow-orange-brand/5'
                            : 'border-zinc-800 bg-zinc-950/60'
                      }`}
                    >
                      {/* Match header */}
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-900/60">
                        <span className="text-[9px] font-bold text-zinc-500 uppercase tracking-wider">
                          Cancha {m.court}
                        </span>
                        {m.status === 'in_progress' ? (
                          <span className="text-[9px] font-black text-red-500 uppercase tracking-wider animate-pulse flex items-center gap-1">
                            🔴 En Vivo
                          </span>
                        ) : m.status === 'finished' ? (
                          <span className="text-[9px] font-bold text-zinc-600 uppercase tracking-wider">
                            Finalizado
                          </span>
                        ) : bothTeamsReady ? (
                          <span className="text-[9px] font-bold text-emerald-500/70 uppercase tracking-wider">
                            Listo
                          </span>
                        ) : (
                          <span className="text-[9px] font-bold text-zinc-700 uppercase tracking-wider">
                            Pendiente
                          </span>
                        )}
                      </div>

                      {/* Teams */}
                      <div className="flex flex-col">
                        {/* Team 1 */}
                        <div className={`flex items-center justify-between px-3 py-2 ${
                          m.status === 'finished' && winnerId === m.team1_id
                            ? 'bg-emerald-500/5'
                            : ''
                        }`}>
                          <div className="flex items-center gap-2 min-w-0 flex-grow">
                            {m.status === 'finished' && winnerId === m.team1_id && (
                              <span className="text-[8px]">✅</span>
                            )}
                            <span className={`text-xs font-bold truncate ${
                              t1TBD
                                ? 'text-zinc-600 italic'
                                : m.status === 'finished' && winnerId === m.team1_id
                                  ? 'text-emerald-400'
                                  : m.status === 'finished' && winnerId !== m.team1_id
                                    ? 'text-zinc-600'
                                    : 'text-zinc-200'
                            }`}>
                              {getTeamName(m.team1_id)}
                            </span>
                          </div>
                          {m.status !== 'pending' && !t1TBD && (
                            <div className="flex items-center gap-1.5">
                              {prevSets.map((set: any, idx: number) => (
                                <span key={idx} className="text-[10px] font-semibold text-zinc-500 font-mono">
                                  {set.team1}
                                </span>
                              ))}
                              <span className="text-xs font-black text-zinc-100 font-mono ml-1">
                                {setsWon.team1}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Divider */}
                        <div className="flex items-center px-3">
                          <Minus className="w-2.5 h-2.5 text-zinc-800" />
                          <div className="h-px flex-grow bg-zinc-900/60" />
                          <Minus className="w-2.5 h-2.5 text-zinc-800" />
                        </div>

                        {/* Team 2 */}
                        <div className={`flex items-center justify-between px-3 py-2 ${
                          m.status === 'finished' && winnerId === m.team2_id
                            ? 'bg-emerald-500/5'
                            : ''
                        }`}>
                          <div className="flex items-center gap-2 min-w-0 flex-grow">
                            {m.status === 'finished' && winnerId === m.team2_id && (
                              <span className="text-[8px]">✅</span>
                            )}
                            <span className={`text-xs font-bold truncate ${
                              t2TBD
                                ? 'text-zinc-600 italic'
                                : m.status === 'finished' && winnerId === m.team2_id
                                  ? 'text-emerald-400'
                                  : m.status === 'finished' && winnerId !== m.team2_id
                                    ? 'text-zinc-600'
                                    : 'text-zinc-200'
                            }`}>
                              {getTeamName(m.team2_id)}
                            </span>
                          </div>
                          {m.status !== 'pending' && !t2TBD && (
                            <div className="flex items-center gap-1.5">
                              {prevSets.map((set: any, idx: number) => (
                                <span key={idx} className="text-[10px] font-semibold text-zinc-500 font-mono">
                                  {set.team2}
                                </span>
                              ))}
                              <span className="text-xs font-black text-zinc-100 font-mono ml-1">
                                {setsWon.team2}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Action button */}
                      {canPlay && onStartMatch && (
                        <button
                          onClick={() => onStartMatch(m.id)}
                          className="w-full py-2 flex items-center justify-center gap-1.5 bg-zinc-900/80 border-t border-zinc-800 text-xs font-extrabold text-orange-brand hover:bg-zinc-800 transition-all uppercase tracking-wider"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          {m.status === 'in_progress' ? 'Continuar' : 'Arbitrar'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
