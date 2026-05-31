import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { 
  ArrowLeft, Trophy, Calendar, Users, Loader2, Play, Activity, CheckCircle
} from 'lucide-react';

interface Team {
  id: string;
  name: string;
}

interface Player {
  id: string;
  name: string;
  number?: number;
}

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
}

interface StandingRow {
  teamId: string;
  teamName: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  setsWon: number;
  setsLost: number;
  pointsWon: number;
  pointsLost: number;
}

export default function TournamentPlay() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'matches' | 'standings' | 'teams'>('matches');
  const [loading, setLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState('');
  const [status, setStatus] = useState<'draft' | 'active' | 'finished'>('active');
  const [format, setFormat] = useState<'league' | 'groups'>('league');
  const [groupCount, setGroupCount] = useState<number>(2);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamRosters, setTeamRosters] = useState<{ [teamId: string]: Player[] }>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [isFinishing, setIsFinishing] = useState(false);

  const userId = user?.id;

  useEffect(() => {
    if (!authLoading && !userId) {
      navigate('/admin/login');
      return;
    }
    if (id) {
      fetchTournamentData();
    }
  }, [id, userId, authLoading]);

  const fetchTournamentData = async () => {
    setLoading(true);
    try {
      // 1. Get Tournament Details
      const { data: tData, error: tErr } = await supabase
        .from('tournaments')
        .select('*')
        .eq('id', id)
        .single();
      if (tErr) throw tErr;

      // If it is draft, redirect to edit
      if (tData.status === 'draft') {
        navigate(`/admin/tournament/${id}/edit`);
        return;
      }

      setTournamentName(tData.name);
      setStatus(tData.status);
      
      const config = tData.config_json || {};
      setFormat(config.format || 'league');
      setGroupCount(config.groupCount || 2);

      // 2. Get Teams
      const { data: teamsData, error: teamsErr } = await supabase
        .from('teams')
        .select('*')
        .eq('tournament_id', id)
        .order('name');
      if (teamsErr) throw teamsErr;
      setTeams(teamsData || []);

      // Fetch rosters
      if (teamsData && teamsData.length > 0) {
        const teamIds = teamsData.map(t => t.id);
        const { data: playersData, error: playersErr } = await supabase
          .from('players')
          .select('*')
          .in('team_id', teamIds)
          .order('name');

        if (!playersErr && playersData) {
          const rosters: { [teamId: string]: Player[] } = {};
          teamsData.forEach(t => { rosters[t.id] = []; });
          playersData.forEach(p => {
            if (rosters[p.team_id]) {
              rosters[p.team_id].push(p);
            }
          });
          setTeamRosters(rosters);
        }
      }

      // 3. Get Matches
      const { data: matchesData, error: matchesErr } = await supabase
        .from('matches')
        .select('*, team1:teams!matches_team1_id_fkey(name), team2:teams!matches_team2_id_fkey(name)')
        .eq('tournament_id', id)
        .order('scheduled_time', { ascending: true })
        .order('round', { ascending: true })
        .order('court', { ascending: true });
      if (matchesErr) throw matchesErr;

      setMatches(matchesData || []);

      // 4. Calculate Standings
      calculateStandings(teamsData || [], matchesData || [], config.setsToWin || 2);

    } catch (e) {
      console.error(e);
      alert('Error al cargar la información del torneo activo.');
      navigate('/admin/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const calculateStandings = (teamsList: Team[], matchesList: Match[], setsLimit: number) => {
    const stats: { [teamId: string]: StandingRow } = {};
    
    teamsList.forEach(team => {
      stats[team.id] = {
        teamId: team.id,
        teamName: team.name,
        played: 0,
        won: 0,
        lost: 0,
        points: 0,
        setsWon: 0,
        setsLost: 0,
        pointsWon: 0,
        pointsLost: 0
      };
    });

    matchesList.forEach(m => {
      if (m.status !== 'finished' || !stats[m.team1_id] || !stats[m.team2_id]) return;

      const team1 = stats[m.team1_id];
      const team2 = stats[m.team2_id];
      const score = m.score_json || {};
      const sets = score.sets || [];

      team1.played += 1;
      team2.played += 1;

      let t1SetsWon = 0;
      let t2SetsWon = 0;
      let t1PtsWon = 0;
      let t2PtsWon = 0;

      sets.forEach((set: any) => {
        const p1 = Number(set.team1Points ?? set.team1 ?? 0);
        const p2 = Number(set.team2Points ?? set.team2 ?? 0);
        t1PtsWon += p1;
        t2PtsWon += p2;
        if (p1 > p2) t1SetsWon++;
        else if (p2 > p1) t2SetsWon++;
      });

      team1.setsWon += t1SetsWon;
      team1.setsLost += t2SetsWon;
      team1.pointsWon += t1PtsWon;
      team1.pointsLost += t2PtsWon;

      team2.setsWon += t2SetsWon;
      team2.setsLost += t1SetsWon;
      team2.pointsWon += t2PtsWon;
      team2.pointsLost += t1PtsWon;

      const winnerId = score.winner_id;
      if (winnerId === m.team1_id) {
        team1.won += 1;
        team2.lost += 1;
        
        if (t2SetsWon === (setsLimit - 1)) {
          team1.points += 2; // Tiebreak win
          team2.points += 1; // Tiebreak loss
        } else {
          team1.points += 3; // Clean win
          team2.points += 0;
        }
      } else if (winnerId === m.team2_id) {
        team2.won += 1;
        team1.lost += 1;

        if (t1SetsWon === (setsLimit - 1)) {
          team2.points += 2;
          team1.points += 1;
        } else {
          team2.points += 3;
          team1.points += 0;
        }
      }
    });

    const standingsArray = Object.values(stats).sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.won !== a.won) return b.won - a.won;
      
      const ratioA = a.setsLost === 0 ? a.setsWon * 1000 : a.setsWon / a.setsLost;
      const ratioB = b.setsLost === 0 ? b.setsWon * 1000 : b.setsWon / b.setsLost;
      if (ratioB !== ratioA) return ratioB - ratioA;

      const pRatioA = a.pointsLost === 0 ? a.pointsWon * 1000 : a.pointsWon / a.pointsLost;
      const pRatioB = b.pointsLost === 0 ? b.pointsWon * 1000 : b.pointsWon / b.pointsLost;
      if (pRatioB !== pRatioA) return pRatioB - pRatioA;

      return a.teamName.localeCompare(b.teamName);
    });

    setStandings(standingsArray);
  };

  const handleFinishTournament = async () => {
    const confirmFinish = confirm('¿Seguro que deseas finalizar el torneo? El estado cambiará a FINALIZADO y no se podrán arbitrar más partidos.');
    if (!confirmFinish) return;

    setIsFinishing(true);
    try {
      const { error } = await supabase
        .from('tournaments')
        .update({ status: 'finished' })
        .eq('id', id);

      if (error) throw error;
      setStatus('finished');
      alert('¡El torneo ha sido finalizado con éxito!');
    } catch (e) {
      console.error(e);
      alert('No se pudo finalizar el torneo.');
    } finally {
      setIsFinishing(false);
    }
  };

  if (loading || authLoading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white font-sans">
        <Loader2 className="w-6 h-6 animate-spin text-orange-brand" />
      </div>
    );
  }

  const renderGroupsStandings = () => {
    const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const groups: { [key: string]: StandingRow[] } = {};
    
    // Find all group letters dynamically from matches
    const groupLetters = new Set<string>();
    matches.forEach(m => {
      if (m.group_name) {
        const letter = m.group_name.replace("Grupo ", "").trim();
        if (letter) groupLetters.add(letter);
      }
    });

    if (groupLetters.size === 0) {
      for (let i = 0; i < groupCount; i++) {
        groupLetters.add(alph[i]);
      }
    }

    const sortedLetters = Array.from(groupLetters).sort();
    sortedLetters.forEach(letter => {
      groups[letter] = [];
    });

    // Assign team rows to groups based on matches played
    standings.forEach(row => {
      const teamMatch = matches.find(m => (m.team1_id === row.teamId || m.team2_id === row.teamId) && m.group_name);
      const groupLetter = teamMatch && teamMatch.group_name
        ? teamMatch.group_name.replace("Grupo ", "").trim()
        : sortedLetters[0] || 'A';

      if (groups[groupLetter]) {
        groups[groupLetter].push(row);
      }
    });

    return Object.entries(groups).map(([letter, groupRows]) => (
      <div key={letter} className="flex flex-col gap-3 p-4 bg-zinc-950 border border-zinc-900 rounded-3xl">
        <h4 className="text-xs font-bold text-purple-brand uppercase border-b border-zinc-900 pb-2">
          Grupo {letter}
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
            <thead>
              <tr className="text-zinc-550 font-bold border-b border-zinc-900 pb-1">
                <th className="py-2 pl-1">Equipo</th>
                <th className="py-2 text-center">PTS</th>
                <th className="py-2 text-center">PJ</th>
                <th className="py-2 text-center">PG</th>
                <th className="py-2 text-center">PP</th>
                <th className="py-2 text-center">PA</th>
                <th className="py-2 text-center">PR</th>
                <th className="py-2 text-center">DP</th>
              </tr>
            </thead>
            <tbody>
              {groupRows.map((row, idx) => {
                const diff = row.pointsWon - row.pointsLost;
                return (
                  <tr key={row.teamId} className="border-b border-zinc-900/40 last:border-0 hover:bg-zinc-900/10">
                    <td className="py-2.5 pl-1 font-bold text-zinc-200 truncate max-w-[100px]">
                      {idx + 1}. {row.teamName}
                    </td>
                    <td className="py-2.5 text-center font-black text-orange-brand text-sm">{row.points}</td>
                    <td className="py-2.5 text-center text-zinc-450">{row.played}</td>
                    <td className="py-2.5 text-center text-emerald-400 font-semibold">{row.won}</td>
                    <td className="py-2.5 text-center text-red-450 font-semibold">{row.lost}</td>
                    <td className="py-2.5 text-center text-zinc-350">{row.pointsWon}</td>
                    <td className="py-2.5 text-center text-zinc-350">{row.pointsLost}</td>
                    <td className={`py-2.5 text-center font-bold ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-450' : 'text-zinc-450'}`}>
                      {diff > 0 ? `+${diff}` : diff}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    ));
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans select-none relative pb-10">
      
      {/* Header */}
      <div className="flex items-center justify-between py-3 border-b border-zinc-900 mb-6 bg-zinc-950/40 px-3 rounded-2xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/dashboard')}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-850"
          >
            <ArrowLeft className="w-4 h-4 text-gray-300" />
          </button>
          <div>
            <h1 className="font-extrabold text-sm truncate max-w-[150px]">{tournamentName}</h1>
            <span className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
              status === 'active' ? 'text-emerald-400' : 'text-blue-400'
            }`}>
              <Activity className="w-2.5 h-2.5" />
              {status === 'active' ? 'Torneo Activo' : 'Finalizado'}
            </span>
          </div>
        </div>

        {/* Finish Tournament Action */}
        {status === 'active' && (
          <button
            onClick={handleFinishTournament}
            disabled={isFinishing}
            className="flex items-center gap-1 px-3 py-2 bg-gradient-to-r from-red-600 to-amber-600 text-white font-bold rounded-xl text-[10px] uppercase tracking-wider disabled:opacity-40"
          >
            {isFinishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle className="w-3 h-3" />}
            Finalizar Torneo
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-3 p-1 bg-zinc-900/60 border border-zinc-850 rounded-2xl mb-6 max-w-sm mx-auto w-full">
        <button
          onClick={() => setActiveTab('matches')}
          className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'matches' ? 'bg-zinc-800 text-orange-brand' : 'text-gray-400'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Partidos
        </button>
        <button
          onClick={() => setActiveTab('standings')}
          className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'standings' ? 'bg-zinc-800 text-purple-brand' : 'text-gray-400'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          Posiciones
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'teams' ? 'bg-zinc-800 text-zinc-200' : 'text-gray-400'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Equipos
        </button>
      </div>

      {/* MAIN CONTAINER */}
      <div className="flex-grow max-w-md mx-auto w-full">
        
        {/* TAB 1: MATCHES */}
        {activeTab === 'matches' && (
          <div className="flex flex-col gap-3">
            {format === 'groups' && matches.length > 0 && (
              <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-3xl mb-1 flex flex-col gap-3">
                <h4 className="text-xs font-bold text-purple-brand uppercase border-b border-zinc-900 pb-2">
                  Distribución de Grupos
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  {(() => {
                    const groupNamesSet = new Set<string>();
                    const teamMapByGroup: { [group: string]: { id: string, name: string }[] } = {};
                    
                    matches.forEach(m => {
                      if (m.group_name) {
                        groupNamesSet.add(m.group_name);
                        if (!teamMapByGroup[m.group_name]) {
                          teamMapByGroup[m.group_name] = [];
                        }
                        const t1 = { id: m.team1_id, name: m.team1?.name || 'Local' };
                        const t2 = { id: m.team2_id, name: m.team2?.name || 'Visitante' };
                        if (!teamMapByGroup[m.group_name].some(t => t.id === t1.id)) {
                          teamMapByGroup[m.group_name].push(t1);
                        }
                        if (!teamMapByGroup[m.group_name].some(t => t.id === t2.id)) {
                          teamMapByGroup[m.group_name].push(t2);
                        }
                      }
                    });

                    const sortedGroups = Array.from(groupNamesSet).sort();

                    return sortedGroups.map(groupName => (
                      <div key={groupName} className="p-3 bg-zinc-900/60 border border-zinc-850 rounded-xl flex flex-col gap-1.5">
                        <span className="text-[10px] font-black text-zinc-300 uppercase border-b border-zinc-800 pb-1">
                          {groupName}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          {teamMapByGroup[groupName].sort((a, b) => a.name.localeCompare(b.name)).map((team, idx) => (
                            <span key={team.id} className="text-[11px] font-medium text-zinc-450 truncate">
                              {idx + 1}. {team.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {matches.length === 0 ? (
              <div className="p-8 border border-zinc-900 border-dashed rounded-3xl text-center text-zinc-500 text-xs">
                Aún no hay partidos generados.
              </div>
            ) : (
              matches.map((m) => {
                const liveScore = m.score_json || {};
                const currentSet = liveScore.current_set || { team1: 0, team2: 0 };
                const setsWon = liveScore.sets_won || { team1: 0, team2: 0 };
                const prevSets = liveScore.sets || [];

                return (
                  <div
                    key={m.id}
                    className={`p-4 border rounded-2xl flex flex-col gap-3 ${
                      m.status === 'in_progress' 
                        ? 'bg-zinc-950 border-orange-brand/50 shadow-md shadow-orange-brand/5'
                        : 'bg-zinc-950/40 border-zinc-900'
                    }`}
                  >
                    {/* Header line info */}
                    <div className="flex items-center justify-between border-b border-zinc-900/60 pb-2">
                      <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">
                        Ronda {m.round} {m.group_name ? `• ${m.group_name}` : ''} • Cancha {m.court}
                      </span>
                      {m.status === 'in_progress' ? (
                        <span className="px-2 py-0.5 rounded bg-red-500/10 text-red-500 text-[8px] font-black border border-red-500/20 uppercase tracking-wider animate-pulse flex items-center gap-1">
                          En Arbitraje 🔴
                        </span>
                      ) : m.status === 'finished' ? (
                        <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 text-[8px] font-bold border border-zinc-800 uppercase tracking-wide">
                          Finalizado
                        </span>
                      ) : (
                        m.scheduled_time && (
                          <span className="text-[9px] font-bold text-orange-brand font-mono">
                            🕒 {new Date(m.scheduled_time).toLocaleDateString('es-ES', {
                              day: 'numeric',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true
                            })}
                          </span>
                        )
                      )}
                    </div>

                    {/* Team display and score */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-2.5 text-left flex-grow">
                        {/* Team 1 */}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-extrabold ${
                            m.status === 'finished' && liveScore.winner_id === m.team1_id
                              ? 'text-orange-brand'
                              : 'text-zinc-200'
                          }`}>
                            {m.team1?.name || 'Local'}
                          </span>
                          {m.status !== 'pending' && (
                            <div className="flex items-center gap-2">
                              {prevSets.map((set: any, idx: number) => (
                                <span key={idx} className="text-[10px] font-semibold text-zinc-500 font-mono w-5 text-center">
                                  {set.team1}
                                </span>
                              ))}
                              {m.status === 'in_progress' && (
                                <span className="text-xs font-black text-orange-brand font-mono w-5 text-center bg-orange-brand/10 rounded px-0.5">
                                  {currentSet.team1}
                                </span>
                              )}
                              <span className="text-xs font-black text-zinc-100 font-mono pl-3 w-5 text-right">
                                {setsWon.team1}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Team 2 */}
                        <div className="flex items-center justify-between">
                          <span className={`text-xs font-extrabold ${
                            m.status === 'finished' && liveScore.winner_id === m.team2_id
                              ? 'text-purple-brand'
                              : 'text-zinc-200'
                          }`}>
                            {m.team2?.name || 'Visitante'}
                          </span>
                          {m.status !== 'pending' && (
                            <div className="flex items-center gap-2">
                              {prevSets.map((set: any, idx: number) => (
                                <span key={idx} className="text-[10px] font-semibold text-zinc-500 font-mono w-5 text-center">
                                  {set.team2}
                                </span>
                              ))}
                              {m.status === 'in_progress' && (
                                <span className="text-xs font-black text-purple-brand font-mono w-5 text-center bg-purple-brand/10 rounded px-0.5">
                                  {currentSet.team2}
                                </span>
                              )}
                              <span className="text-xs font-black text-zinc-100 font-mono pl-3 w-5 text-right">
                                {setsWon.team2}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Referee Action Button */}
                    {status === 'active' && m.status !== 'finished' && (
                      <button
                        onClick={() => navigate(`/admin/match/referee/${m.id}`)}
                        className="mt-1 flex items-center justify-center gap-1.5 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-orange-brand/50 text-white font-extrabold rounded-xl text-[10px] uppercase tracking-wider transition-all"
                      >
                        <Play className="w-3 h-3 fill-current text-orange-brand" />
                        {m.status === 'in_progress' ? 'Continuar Arbitraje' : 'Iniciar Arbitraje'}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* TAB 2: STANDINGS */}
        {activeTab === 'standings' && (
          <div className="flex flex-col gap-4">
            {(format === 'groups' || matches.some(m => m.group_name)) ? (
              renderGroupsStandings()
            ) : (
              <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-3xl flex flex-col gap-3">
                <h4 className="text-xs font-bold text-orange-brand uppercase border-b border-zinc-900 pb-2">
                  Tabla General de la Liga
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs whitespace-nowrap">
                    <thead>
                      <tr className="text-zinc-550 font-bold border-b border-zinc-900 pb-1">
                        <th className="py-2 pl-1">Pos</th>
                        <th className="py-2">Equipo</th>
                        <th className="py-2 text-center">PTS</th>
                        <th className="py-2 text-center">PJ</th>
                        <th className="py-2 text-center">PG</th>
                        <th className="py-2 text-center">PP</th>
                        <th className="py-2 text-center">PA</th>
                        <th className="py-2 text-center">PR</th>
                        <th className="py-2 text-center">DP</th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((row, idx) => {
                        const diff = row.pointsWon - row.pointsLost;
                        return (
                          <tr key={row.teamId} className="border-b border-zinc-900/40 last:border-0 hover:bg-zinc-900/10">
                            <td className="py-2.5 pl-1 font-mono text-zinc-550">{idx + 1}</td>
                            <td className="py-2.5 font-bold text-zinc-200 truncate max-w-[120px]">{row.teamName}</td>
                            <td className="py-2.5 text-center font-black text-orange-brand text-sm">{row.points}</td>
                            <td className="py-2.5 text-center text-zinc-450">{row.played}</td>
                            <td className="py-2.5 text-center text-emerald-400 font-semibold">{row.won}</td>
                            <td className="py-2.5 text-center text-red-450 font-semibold">{row.lost}</td>
                            <td className="py-2.5 text-center text-zinc-350">{row.pointsWon}</td>
                            <td className="py-2.5 text-center text-zinc-350">{row.pointsLost}</td>
                            <td className={`py-2.5 text-center font-bold ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-450' : 'text-zinc-450'}`}>
                              {diff > 0 ? `+${diff}` : diff}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            
            {/* Table Legend/Glossary */}
            <div className="p-4 bg-zinc-950/40 border border-zinc-900/80 rounded-2xl text-[10px] text-zinc-500 leading-relaxed mt-2">
              <span className="font-bold text-zinc-400 block mb-1">Abreviaturas de la tabla:</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span><strong>PTS:</strong> Puntos ganados en la tabla</span>
                <span><strong>PJ:</strong> Partidos Jugados</span>
                <span><strong>PG:</strong> Partidos Ganados</span>
                <span><strong>PP:</strong> Partidos Perdidos</span>
                <span><strong>PA:</strong> Puntos Anotados (Puntos a favor)</span>
                <span><strong>PR:</strong> Puntos Recibidos (Puntos en contra)</span>
                <span className="col-span-2"><strong>DP:</strong> Diferencia de Puntos (PA - PR)</span>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: TEAMS & ROSTERS */}
        {activeTab === 'teams' && (
          <div className="flex flex-col gap-3">
            {teams.map((t) => (
              <div key={t.id} className="p-4 bg-zinc-950 border border-zinc-900 rounded-3xl flex flex-col gap-3">
                <h4 className="font-extrabold text-sm text-zinc-200 border-b border-zinc-900 pb-2">
                  {t.name}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {teamRosters[t.id]?.length === 0 ? (
                    <p className="text-[10px] text-zinc-650 italic col-span-2">Sin jugadores asignados</p>
                  ) : (
                    teamRosters[t.id]?.map(p => (
                      <div key={p.id} className="bg-zinc-900/40 p-2 rounded-xl border border-zinc-850/50 text-left text-xs font-semibold text-zinc-350">
                        {p.number !== null && p.number !== undefined ? `#${p.number} ` : ''}{p.name}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
