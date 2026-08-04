import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { ArrowLeft, Trophy, Calendar, Users, Loader2, Play, Sword } from 'lucide-react';
import MatchDetailModal from './MatchDetailModal';
import { calculateBestThirds, sortWithTiebreaks, normalizeTiebreakCriteria, DEFAULT_TIEBREAK_CRITERIA, type StandingRowSimple, type StandingRowLike, type TiebreakCriterion, type MatchRef } from '../utils/fixtureGenerator';

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
  match_type?: string;
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

export default function PublicTournament() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'matches' | 'standings' | 'bracket' | 'teams'>('matches');
  const [loading, setLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState('');
  const [format, setFormat] = useState<'league' | 'groups' | 'groups_knockout'>('league');
  const [groupCount, setGroupCount] = useState<number>(2);
  const [qualifiersPerGroup, setQualifiersPerGroup] = useState<number>(2);
  const [bestThirdsCount, setBestThirdsCount] = useState<number>(0);
  const [tiebreakCriteria, setTiebreakCriteriaState] = useState<TiebreakCriterion[]>([...DEFAULT_TIEBREAK_CRITERIA]);
  const [setsToWin, setSetsToWin] = useState(2);
  const [regularPoints, setRegularPoints] = useState(25);
  const [tiebreakPoints, setTiebreakPoints] = useState(5);
  const [overtimeMode, setOvertimeMode] = useState<'con_alargue' | 'a_muerte'>('con_alargue');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamRosters, setTeamRosters] = useState<{ [teamId: string]: Player[] }>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);

  useEffect(() => {
    if (id) {
      fetchTournamentData();
    }
  }, [id]);

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

      setTournamentName(tData.name);
      const config = tData.config_json || {};
      setFormat(config.format || 'league');
      setGroupCount(config.groupCount || 2);
      setQualifiersPerGroup(config.qualifiersPerGroup || 2);
      setBestThirdsCount(config.bestThirdsCount || 0);
      setTiebreakCriteriaState(normalizeTiebreakCriteria(config.tiebreak_criteria));
      setSetsToWin(config.setsToWin || 2);
      setRegularPoints(config.regularPoints || 25);
      setTiebreakPoints(config.tiebreakPoints || 5);
      setOvertimeMode(config.overtimeMode || 'con_alargue');

      // 2. Get Teams
      const { data: teamsData, error: teamsErr } = await supabase
        .from('teams')
        .select('*')
        .eq('tournament_id', id)
        .order('name');
      if (teamsErr) throw teamsErr;
      setTeams(teamsData || []);

      // Fetch rosters for all teams
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
      alert('Error al cargar el torneo público.');
      navigate('/tournaments');
    } finally {
      setLoading(false);
    }
  };

  const calculateStandings = (teamsList: Team[], matchesList: Match[], setsLimit: number) => {
    const stats: { [teamId: string]: StandingRow } = {};
    
    // Initialize stats
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

    // Loop through finished matches
    matchesList.forEach(m => {
      if (m.status !== 'finished' || !stats[m.team1_id] || !stats[m.team2_id] || m.match_type === 'knockout') return;

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
        
        // Scoring points distribution
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

    // Sort standings
    const standingsArray = sortWithTiebreaks<StandingRowLike>(
      Object.values(stats),
      tiebreakCriteria,
      matchesList.filter(m => m.status === 'finished') as MatchRef[]
    ) as StandingRow[];

    setStandings(standingsArray);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white font-sans">
        <Loader2 className="w-6 h-6 animate-spin text-orange-brand" />
      </div>
    );
  }

  // Format groupings preview helper
  const renderGroupsStandings = () => {
    const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const groups: { [key: string]: StandingRow[] } = {};

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

    standings.forEach(row => {
      const teamMatch = matches.find(m => (m.team1_id === row.teamId || m.team2_id === row.teamId) && m.group_name);
      const groupLetter = teamMatch && teamMatch.group_name
        ? teamMatch.group_name.replace("Grupo ", "").trim()
        : sortedLetters[0] || 'A';

      if (groups[groupLetter]) {
        groups[groupLetter].push(row);
      }
    });

    const isKnockout = format === 'groups_knockout';
    const bestThirdIds = new Set<string>();

    if (isKnockout && bestThirdsCount > 0) {
      const groupStandingsMap = new Map<string, StandingRowSimple[]>();
      sortedLetters.forEach(letter => {
        groupStandingsMap.set(letter, (groups[letter] || []).map((r: any) => ({
          teamId: r.teamId, teamName: r.teamName,
          points: r.points, setsWon: r.setsWon, setsLost: r.setsLost,
          pointsWon: r.pointsWon, pointsLost: r.pointsLost,
        })));
      });
      const bt = calculateBestThirds(groupStandingsMap, bestThirdsCount, tiebreakCriteria,
        matches.filter(m => m.status === 'finished' && m.match_type !== 'knockout') as MatchRef[]);
      bt.forEach(t => bestThirdIds.add(t.teamId));
    }

    return Object.entries(groups).map(([letter, groupRows]) => (
      <div key={letter} className="flex flex-col gap-3 p-4 bg-zinc-950 border border-zinc-900 rounded-3xl">
        <h4 className="text-xs font-bold text-purple-brand uppercase border-b border-zinc-900 pb-2">
          Grupo {letter}
        </h4>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
            <thead>
              <tr className="text-zinc-550 font-bold border-b border-zinc-900 pb-1 text-sm">
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
                let badge: string | null = null;

                if (isKnockout) {
                  if (idx < qualifiersPerGroup) {
                    badge = '✓ Clasificado';
                  } else if (idx === 2 && bestThirdIds.has(row.teamId)) {
                    badge = '⭐ Mejor 3ro';
                  }
                }

                return (
                  <tr key={row.teamId} className="border-b border-zinc-900/40 last:border-0 hover:bg-zinc-900/10">
                    <td className="py-2.5 pl-1 font-bold text-zinc-200 truncate max-w-[100px] text-sm">
                      <div className="flex items-center gap-1.5">
                        <span className="text-zinc-500">{idx + 1}.</span>
                        <span>{row.teamName}</span>
                        {badge && (
                          <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-md ${
                            badge.startsWith('✓') ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'
                          }`}>
                            {badge}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-2.5 text-center font-black text-orange-brand text-base">{row.points}</td>
                    <td className="py-2.5 text-center text-zinc-450 text-sm">{row.played}</td>
                    <td className="py-2.5 text-center text-emerald-400 font-semibold text-sm">{row.won}</td>
                    <td className="py-2.5 text-center text-red-450 font-semibold text-sm">{row.lost}</td>
                    <td className="py-2.5 text-center text-zinc-350 text-sm">{row.pointsWon}</td>
                    <td className="py-2.5 text-center text-zinc-350 text-sm">{row.pointsLost}</td>
                    <td className={`py-2.5 text-center font-bold text-sm ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-450' : 'text-zinc-450'}`}>
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

  const renderBracket = () => {
    const knockoutMatches = matches.filter(m => m.match_type === 'knockout');
    if (knockoutMatches.length === 0) return null;

    const maxRound = Math.max(...knockoutMatches.map(m => m.round));

    const rounds: number[] = [];
    for (let i = 1; i <= maxRound; i++) rounds.push(i);

    const roundNames: { [r: number]: string } = {};
    rounds.forEach(r => {
      const names = ['', 'Final', 'Semifinales', 'Cuartos', 'Octavos'];
      const totalRounds = maxRound;
      const idx = totalRounds - r + 1;
      roundNames[r] = names[idx] || `Ronda ${r}`;
    });

    return (
      <div className="flex flex-col gap-5">
        {rounds.map(round => {
          const roundMatches = knockoutMatches.filter(m => m.round === round).sort((a, b) => a.id.localeCompare(b.id));
          if (roundMatches.length === 0) return null;

          const isLastRound = round === maxRound;

          return (
            <div key={round} className="flex flex-col gap-2">
              <h4 className={`text-xs font-black uppercase tracking-wider border-b border-zinc-900 pb-2 ${
                isLastRound ? 'text-amber-400' : round === 1 ? 'text-orange-brand' : 'text-purple-brand'
              }`}>
                {roundNames[round]}
              </h4>
              <div className="flex flex-col gap-2">
                {roundMatches.map((m) => {
                  const score = m.score_json || {};
                  const isDone = m.status === 'finished';
                  const t1Name = m.team1?.name || 'Por definir';
                  const t2Name = m.team2?.name || 'Por definir';
                  const isLive = m.status === 'in_progress';
                  const isPending = m.status === 'pending';

                  return (
                    <div
                      key={m.id}
                      onClick={() => setSelectedMatch(m)}
                      className={`p-3 border rounded-xl flex flex-col gap-2 cursor-pointer transition-all ${
                        isLive
                          ? 'bg-zinc-950 border-orange-brand/50 shadow-md'
                          : isDone
                          ? 'bg-zinc-950/40 border-zinc-900 hover:border-zinc-700'
                          : 'bg-zinc-950/20 border-zinc-900/60 border-dashed hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-center justify-between text-2xs font-bold text-zinc-600 uppercase">
                        <span>Cancha {m.court}</span>
                        {isLive ? (
                          <span className="text-red-500 animate-pulse flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                            En Vivo
                          </span>
                        ) : isDone ? (
                          <span className="text-zinc-500">Finalizado</span>
                        ) : (
                          <span className="text-zinc-600">Pendiente</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-extrabold truncate max-w-[120px] ${
                          isDone && score.winner_id === m.team1_id ? 'text-orange-brand' : isPending ? 'text-zinc-600' : 'text-zinc-200'
                        }`}>
                          {t1Name}
                        </span>
                        {!isPending && (
                          <span className="text-sm font-mono text-zinc-400">
                            {(score.sets_won || {}).team1 ?? 0}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-extrabold truncate max-w-[120px] ${
                          isDone && score.winner_id === m.team2_id ? 'text-purple-brand' : isPending ? 'text-zinc-600' : 'text-zinc-200'
                        }`}>
                          {t2Name}
                        </span>
                        {!isPending && (
                          <span className="text-sm font-mono text-zinc-400">
                            {(score.sets_won || {}).team2 ?? 0}
                          </span>
                        )}
                      </div>
                      {isLive && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/tournament/${id}/live/${m.id}`);
                          }}
                          className="mt-1 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-black rounded-xl text-xs uppercase tracking-wider transition-transform active:scale-[0.98]"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          Ver Marcador En Vivo
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
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans select-none relative pb-10">
      
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 py-3 border-b border-zinc-900 bg-zinc-950/40 px-3 rounded-2xl">
        <button
          onClick={() => navigate('/tournaments')}
          className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-850"
        >
          <ArrowLeft className="w-4 h-4 text-gray-300" />
        </button>
        <div>
          <h1 className="font-extrabold text-xl truncate max-w-[200px]">{tournamentName}</h1>
          <span className="text-xs text-purple-brand font-bold uppercase tracking-wider">Tablero del Espectador</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="grid grid-cols-4 p-1 bg-zinc-900/60 border border-zinc-850 rounded-2xl mb-6 max-w-sm mx-auto w-full">
        <button
          onClick={() => setActiveTab('matches')}
          className={`py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'matches' ? 'bg-zinc-800 text-orange-brand' : 'text-gray-400'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Partidos
        </button>
        <button
          onClick={() => setActiveTab('standings')}
          className={`py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'standings' ? 'bg-zinc-800 text-purple-brand' : 'text-gray-400'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          Posiciones
        </button>
        <button
          onClick={() => setActiveTab('bracket')}
          className={`py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'bracket' ? 'bg-zinc-800 text-amber-400' : 'text-gray-400'
          }`}
        >
          <Sword className="w-3.5 h-3.5" />
          Llave
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`py-2.5 text-sm font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'teams' ? 'bg-zinc-800 text-zinc-200' : 'text-gray-400'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Equipos
        </button>
      </div>

      {/* Main Tab Views */}
      <div className="flex-grow max-w-md mx-auto w-full">

        {/* Tab 1: Matches list */}
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
                        <span className="text-xs font-black text-zinc-300 uppercase border-b border-zinc-800 pb-1">
                          {groupName}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          {teamMapByGroup[groupName].sort((a, b) => a.name.localeCompare(b.name)).map((team, idx) => (
                            <span key={team.id} className="text-xs font-medium text-zinc-450 truncate">
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
                Aún no hay partidos programados en este torneo.
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
                    onClick={() => setSelectedMatch(m)}
                    className={`p-4 border rounded-2xl flex flex-col gap-3 transition-colors cursor-pointer ${
                      m.status === 'in_progress' 
                        ? 'bg-zinc-950 border-orange-brand/50 shadow-md shadow-orange-brand/5'
                        : 'bg-zinc-950/40 border-zinc-900 hover:border-zinc-700'
                    }`}
                  >
                    {/* Top Row Status info */}
                    <div className="flex items-center justify-between border-b border-zinc-900/60 pb-2">
                      <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                        Ronda {m.round} {m.group_name ? `• ${m.group_name}` : ''} • Cancha {m.court}
                      </span>
                      {m.status === 'in_progress' ? (
                        <span className="px-2.5 py-1 rounded bg-red-500/10 text-red-500 text-xs font-black border border-red-500/20 uppercase tracking-wider animate-pulse flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                          En Vivo 🔴
                        </span>
                      ) : m.status === 'finished' ? (
                        <span className="px-2 py-0.5 rounded bg-zinc-900 text-zinc-400 text-xs font-bold border border-zinc-800 uppercase tracking-wide">
                          Finalizado
                        </span>
                      ) : (
                        m.scheduled_time && (
                          <span className="text-sm font-bold text-orange-brand font-mono">
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

                    {/* Match Score Display Area */}
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-2.5 text-left flex-grow">
                        {/* Team 1 */}
                        <div className="flex items-center justify-between">
                          <span className={`text-base font-extrabold ${
                            m.status === 'finished' && liveScore.winner_id === m.team1_id
                              ? 'text-orange-brand'
                              : 'text-zinc-200'
                          }`}>
                            {m.team1?.name || 'Local'}
                          </span>
                          {/* Live / Finished sets summary */}
                          {m.status !== 'pending' && (
                            <div className="flex items-center gap-2">
                              {prevSets.map((set: any, idx: number) => (
                                <span key={idx} className="text-sm font-semibold text-zinc-500 font-mono w-5 text-center">
                                  {set.team1}
                                </span>
                              ))}
                              {m.status === 'in_progress' && (
                                <span className="text-base font-black text-orange-brand font-mono w-5 text-center bg-orange-brand/10 rounded px-0.5">
                                  {currentSet.team1}
                                </span>
                              )}
                              <span className="text-base font-black text-zinc-100 font-mono pl-3 w-5 text-right">
                                {setsWon.team1}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Team 2 */}
                        <div className="flex items-center justify-between">
                          <span className={`text-base font-extrabold ${
                            m.status === 'finished' && liveScore.winner_id === m.team2_id
                              ? 'text-purple-brand'
                              : 'text-zinc-200'
                          }`}>
                            {m.team2?.name || 'Visitante'}
                          </span>
                          {/* Live / Finished sets summary */}
                          {m.status !== 'pending' && (
                            <div className="flex items-center gap-2">
                              {prevSets.map((set: any, idx: number) => (
                                <span key={idx} className="text-sm font-semibold text-zinc-500 font-mono w-5 text-center">
                                  {set.team2}
                                </span>
                              ))}
                              {m.status === 'in_progress' && (
                                <span className="text-base font-black text-purple-brand font-mono w-5 text-center bg-purple-brand/10 rounded px-0.5">
                                  {currentSet.team2}
                                </span>
                              )}
                              <span className="text-base font-black text-zinc-100 font-mono pl-3 w-5 text-right">
                                {setsWon.team2}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Button for live scoreboard */}
                    {m.status === 'in_progress' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/tournament/${id}/live/${m.id}`);
                        }}
                        className="mt-1 flex items-center justify-center gap-1.5 py-2.5 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-black rounded-xl text-base uppercase tracking-wider transition-transform active:scale-[0.98]"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Ver Marcador En Vivo 🔴
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Tab 2: Standings layout */}
        {activeTab === 'standings' && (
          <div className="flex flex-col gap-4">
            {(format === 'groups' || format === 'groups_knockout' || matches.some(m => m.group_name)) ? (
              renderGroupsStandings()
            ) : (
              <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-3xl flex flex-col gap-3">
                <h4 className="text-xs font-bold text-orange-brand uppercase border-b border-zinc-900 pb-2">
                  Tabla General de la Liga
                </h4>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
                    <thead>
                      <tr className="text-zinc-550 font-bold border-b border-zinc-900 pb-1 text-sm">
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
                            <td className="py-2.5 pl-1 font-mono text-zinc-550 text-sm">{idx + 1}</td>
                            <td className="py-2.5 font-bold text-zinc-200 truncate max-w-[120px] text-sm">{row.teamName}</td>
                            <td className="py-2.5 text-center font-black text-orange-brand text-base">{row.points}</td>
                            <td className="py-2.5 text-center text-zinc-450 text-sm">{row.played}</td>
                            <td className="py-2.5 text-center text-emerald-400 font-semibold text-sm">{row.won}</td>
                            <td className="py-2.5 text-center text-red-450 font-semibold text-sm">{row.lost}</td>
                            <td className="py-2.5 text-center text-zinc-350 text-sm">{row.pointsWon}</td>
                            <td className="py-2.5 text-center text-zinc-350 text-sm">{row.pointsLost}</td>
                            <td className={`py-2.5 text-center font-bold text-sm ${diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-450' : 'text-zinc-450'}`}>
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
            <div className="p-4 bg-zinc-950/40 border border-zinc-900/80 rounded-2xl text-sm text-zinc-555 leading-relaxed mt-2">
              <span className="font-bold text-zinc-400 block mb-1 text-sm">Abreviaturas de la tabla:</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
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

        {/* Tab 3: Bracket */}
        {activeTab === 'bracket' && (
          <div className="flex flex-col gap-4">
            {format === 'groups_knockout' ? (
              matches.filter(m => m.match_type === 'knockout').length > 0 ? (
                renderBracket()
              ) : (
                <div className="p-8 border border-zinc-900 border-dashed rounded-3xl text-center flex flex-col items-center gap-3">
                  <Sword className="w-8 h-8 text-zinc-700" />
                  <p className="text-sm text-zinc-500 max-w-xs">
                    Las llaves de eliminación estarán disponibles cuando finalice la fase de grupos.
                  </p>
                </div>
              )
            ) : (
              <div className="p-8 border border-zinc-900 border-dashed rounded-3xl text-center flex flex-col items-center gap-3">
                <Sword className="w-8 h-8 text-zinc-700" />
                <p className="text-sm text-zinc-500">Este torneo no usa el formato de Grupos + Eliminatorias.</p>
              </div>
            )}
          </div>
        )}

        {/* Tab 4: Teams and Rosters list */}
        {activeTab === 'teams' && (
          <div className="flex flex-col gap-3">
            {teams.length === 0 ? (
              <div className="p-8 border border-zinc-900 border-dashed rounded-3xl text-center text-zinc-500 text-xs">
                Aún no hay equipos inscritos.
              </div>
            ) : (
              teams.map((t) => (
                <div key={t.id} className="p-4 bg-zinc-950 border border-zinc-900 rounded-3xl flex flex-col gap-3">
                  <h4 className="font-extrabold text-sm text-zinc-200 border-b border-zinc-900 pb-2">
                    {t.name}
                  </h4>
                  <div className="grid grid-cols-2 gap-2">
                    {teamRosters[t.id]?.length === 0 ? (
                      <p className="text-2xs text-zinc-650 italic col-span-2">Sin jugadores asignados</p>
                    ) : (
                      teamRosters[t.id]?.map(p => (
                        <div key={p.id} className="bg-zinc-900/40 p-2 rounded-xl border border-zinc-850/50 text-left text-xs font-semibold text-zinc-350">
                          {p.number !== null && p.number !== undefined ? `#${p.number} ` : ''}{p.name}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

      </div>

      {selectedMatch && (
        <MatchDetailModal
          match={selectedMatch}
          tournamentId={id!}
          tournamentName={tournamentName}
          setsToWin={setsToWin}
          regularPoints={regularPoints}
          tiebreakPoints={tiebreakPoints}
          overtimeMode={overtimeMode}
          canEdit={false}
          currentUserEmail=""
          onClose={() => setSelectedMatch(null)}
          onSaved={() => fetchTournamentData()}
          isAdminView={false}
        />
      )}
    </div>
  );
}
