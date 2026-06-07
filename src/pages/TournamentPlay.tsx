import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { 
  ArrowLeft, Trophy, Calendar, Users, Loader2, Play, Activity, CheckCircle, Swords, Zap, UserPlus, Trash2
} from 'lucide-react';
import { generatePlayoffBracket } from '../utils/fixtureGenerator';
import PlayoffBracket from '../components/PlayoffBracket';

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

  const [activeTab, setActiveTab] = useState<'matches' | 'standings' | 'teams' | 'bracket' | 'staff'>('matches');
  const [loading, setLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState('');
  const [status, setStatus] = useState<'draft' | 'active' | 'finished'>('active');
  const [format, setFormat] = useState<'league' | 'groups'>('league');
  const [groupCount, setGroupCount] = useState<number>(2);
  const [courts, setCourts] = useState<number>(1);
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<number | 'all'>('all');
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamRosters, setTeamRosters] = useState<{ [teamId: string]: Player[] }>({});
  const [matches, setMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [isFinishing, setIsFinishing] = useState(false);

  // Playoff states
  const [playoffStarted, setPlayoffStarted] = useState(false);
  const [isGeneratingPlayoffs, setIsGeneratingPlayoffs] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [setsToWin, setSetsToWin] = useState(2);
  const [configJson, setConfigJson] = useState<any>({});

  // Playoff rules config
  const [playoffRegularPoints, setPlayoffRegularPoints] = useState(21);
  const [playoffTiebreakPoints, setPlayoffTiebreakPoints] = useState(15);
  const [playoffSetsToWin, setPlayoffSetsToWin] = useState(2);
  const [playoffOvertimeMode, setPlayoffOvertimeMode] = useState<'con_alargue' | 'a_muerte'>('con_alargue');

  // Collaborators/Role states
  const [userRole, setUserRole] = useState<'creator' | 'admin' | 'referee' | null>(null);
  const [collaborators, setCollaborators] = useState<{ id: string, email: string, role: 'admin' | 'referee' }[]>([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(false);
  const [inviteAdminActive, setInviteAdminActive] = useState(false);
  const [inviteRefereeActive, setInviteRefereeActive] = useState(false);
  const [copyFeedbackAdmin, setCopyFeedbackAdmin] = useState(false);
  const [copyFeedbackReferee, setCopyFeedbackReferee] = useState(false);

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

      // Check access role
      let role: 'creator' | 'admin' | 'referee' | null = null;
      if (tData.created_by === userId) {
        role = 'creator';
      } else {
        const { data: collabData, error: collabErr } = await supabase
          .from('tournament_collaborators')
          .select('role')
          .eq('tournament_id', id)
          .eq('email', user?.email?.toLowerCase())
          .maybeSingle();

        if (collabErr) throw collabErr;
        if (collabData) {
          role = collabData.role as 'admin' | 'referee';
        }
      }

      if (!role) {
        alert('No tienes acceso a este torneo.');
        navigate('/admin/dashboard');
        return;
      }

      setUserRole(role);

      // If it is draft, redirect to edit
      if (tData.status === 'draft') {
        navigate(`/admin/tournament/${id}/edit`);
        return;
      }

      setTournamentName(tData.name);
      setStatus(tData.status);
      
      const config = tData.config_json || {};
      setConfigJson(config);
      setInviteAdminActive(!!config.public_invite_admin);
      setInviteRefereeActive(!!config.public_invite_referee);

      setFormat(config.format || 'league');
      setGroupCount(config.groupCount || 2);
      setCourts(config.courts || 1);
      setSetsToWin(config.setsToWin || 2);
      setPlayoffStarted(!!config.playoff_started);

      // Restore playoff rules if they were saved
      if (config.playoffRules) {
        setPlayoffRegularPoints(config.playoffRules.regularPoints || 21);
        setPlayoffTiebreakPoints(config.playoffRules.tiebreakPoints || 15);
        setPlayoffSetsToWin(config.playoffRules.setsToWin || 2);
        setPlayoffOvertimeMode(config.playoffRules.overtimeMode || 'con_alargue');
      }

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

      // 5. Fetch Collaborators if creator
      if (role === 'creator') {
        await fetchCollaborators();
      }

    } catch (e) {
      console.error(e);
      alert('Error al cargar la información del torneo activo.');
      navigate('/admin/dashboard');
    } finally {
      setLoading(false);
    }
  };

  const fetchCollaborators = async () => {
    if (!id) return;
    setLoadingCollaborators(true);
    try {
      const { data, error } = await supabase
        .from('tournament_collaborators')
        .select('*')
        .eq('tournament_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCollaborators(data || []);
    } catch (err) {
      console.error('Error fetching collaborators:', err);
    } finally {
      setLoadingCollaborators(false);
    }
  };

  const toggleInviteLink = async (role: 'admin' | 'referee') => {
    const isCurrentActive = role === 'admin' ? inviteAdminActive : inviteRefereeActive;
    const nextVal = !isCurrentActive;
    
    if (role === 'admin') setInviteAdminActive(nextVal);
    else setInviteRefereeActive(nextVal);

    try {
      const updatedConfig = {
        ...configJson,
        public_invite_admin: role === 'admin' ? nextVal : inviteAdminActive,
        public_invite_referee: role === 'referee' ? nextVal : inviteRefereeActive,
      };

      const { error } = await supabase
        .from('tournaments')
        .update({ config_json: updatedConfig })
        .eq('id', id);

      if (error) throw error;
      setConfigJson(updatedConfig);
    } catch (e) {
      console.error('Error updating invite toggle:', e);
      alert('No se pudo guardar la configuración de invitación.');
      if (role === 'admin') setInviteAdminActive(isCurrentActive);
      else setInviteRefereeActive(isCurrentActive);
    }
  };

  const handleDeleteCollaborator = async (collabId: string) => {
    if (!confirm('¿Seguro que deseas eliminar a este colaborador? Ya no tendrá acceso al torneo.')) return;
    try {
      const { error } = await supabase
        .from('tournament_collaborators')
        .delete()
        .eq('id', collabId);

      if (error) throw error;
      setCollaborators(collaborators.filter(c => c.id !== collabId));
    } catch (err) {
      console.error('Error deleting collaborator:', err);
      alert('Error al eliminar colaborador.');
    }
  };

  const handleCopyLink = (role: 'admin' | 'referee') => {
    const joinUrl = `${window.location.origin}/admin/login?join=${role}&tournamentId=${id}`;
    navigator.clipboard.writeText(joinUrl);
    if (role === 'admin') {
      setCopyFeedbackAdmin(true);
      setTimeout(() => setCopyFeedbackAdmin(false), 2000);
    } else {
      setCopyFeedbackReferee(true);
      setTimeout(() => setCopyFeedbackReferee(false), 2000);
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

  // Check if all group-phase matches are finished
  const groupMatches = matches.filter(m => m.group_name?.startsWith('Grupo') || (!m.group_name && matches.every(mm => !mm.group_name)));
  const allGroupsFinished = groupMatches.length > 0 && groupMatches.every(m => m.status === 'finished');
  const hasKnockoutMatches = matches.some(m => m.group_name && !m.group_name.startsWith('Grupo'));

  // Simulate all pending matches for testing
  const handleSimulateAllMatches = async () => {
    const confirmSim = confirm('⚠️ MODO PRUEBA: ¿Simular todos los partidos pendientes con puntajes aleatorios?');
    if (!confirmSim) return;

    setIsSimulating(true);
    try {
      const pendingMatches = matches.filter(m => m.status === 'pending' && m.team1_id && m.team2_id);
      const regularPts = configJson.regularPoints || 25;
      const tiebreakPts = configJson.tiebreakPoints || 15;
      const setsNeeded = setsToWin;

      for (const m of pendingMatches) {
        // Only simulate group matches (not knockout)
        if (m.group_name && !m.group_name.startsWith('Grupo')) continue;

        let t1SetsWon = 0;
        let t2SetsWon = 0;
        const sets: any[] = [];

        while (t1SetsWon < setsNeeded && t2SetsWon < setsNeeded) {
          const isLastPossibleSet = t1SetsWon === setsNeeded - 1 && t2SetsWon === setsNeeded - 1;
          const maxPts = isLastPossibleSet ? tiebreakPts : regularPts;
          
          // Generate random but realistic scores
          const winner = Math.random() > 0.5 ? 'team1' : 'team2';
          const loserScore = Math.floor(Math.random() * (maxPts - 3)) + 2; // at least 2
          const winnerScore = maxPts;

          if (winner === 'team1') {
            sets.push({ team1: winnerScore, team2: loserScore, team1Points: winnerScore, team2Points: loserScore });
            t1SetsWon++;
          } else {
            sets.push({ team1: loserScore, team2: winnerScore, team1Points: loserScore, team2Points: winnerScore });
            t2SetsWon++;
          }
        }

        const winnerId = t1SetsWon > t2SetsWon ? m.team1_id : m.team2_id;

        await supabase
          .from('matches')
          .update({
            status: 'finished',
            score_json: {
              sets,
              current_set: { team1: 0, team2: 0 },
              sets_won: { team1: t1SetsWon, team2: t2SetsWon },
              winner_id: winnerId,
            }
          })
          .eq('id', m.id);
      }

      await fetchTournamentData();
      alert('✅ Todos los partidos de grupo han sido simulados.');
    } catch (e) {
      console.error(e);
      alert('Error al simular partidos.');
    } finally {
      setIsSimulating(false);
    }
  };

  // Generate playoff bracket
  const handleGeneratePlayoffs = async () => {
    if (!allGroupsFinished) {
      alert('Todos los partidos de la fase de grupos deben estar finalizados antes de generar las llaves.');
      return;
    }

    const confirmGen = confirm('¿Generar la fase de eliminación directa? Se crearán los partidos de la llave.');
    if (!confirmGen) return;

    setIsGeneratingPlayoffs(true);
    try {
      // Calculate standings per group, get top 2 from each
      const classifiedTeams: { teamId: string; teamName: string; points: number; setsWon: number; setsLost: number; pointsWon: number; pointsLost: number; groupRank: number }[] = [];

      // Find group letters from matches
      const groupLetters = new Set<string>();
      matches.forEach(m => {
        if (m.group_name?.startsWith('Grupo')) {
          const letter = m.group_name.replace('Grupo ', '').trim();
          if (letter) groupLetters.add(letter);
        }
      });

      const sortedLetters = Array.from(groupLetters).sort();

      // Calculate per-group standings
      sortedLetters.forEach(letter => {
        const groupMatchesLocal = matches.filter(m => m.group_name === `Grupo ${letter}`);
        const teamIdsInGroup = new Set<string>();
        groupMatchesLocal.forEach(m => {
          teamIdsInGroup.add(m.team1_id);
          teamIdsInGroup.add(m.team2_id);
        });

        const stats: { [id: string]: { points: number; won: number; setsWon: number; setsLost: number; pointsWon: number; pointsLost: number } } = {};
        teamIdsInGroup.forEach(tid => {
          stats[tid] = { points: 0, won: 0, setsWon: 0, setsLost: 0, pointsWon: 0, pointsLost: 0 };
        });

        groupMatchesLocal.forEach(m => {
          if (m.status !== 'finished') return;
          const score = m.score_json || {};
          const sets = score.sets || [];
          let t1SW = 0, t2SW = 0, t1PW = 0, t2PW = 0;
          sets.forEach((s: any) => {
            const p1 = Number(s.team1Points ?? s.team1 ?? 0);
            const p2 = Number(s.team2Points ?? s.team2 ?? 0);
            t1PW += p1; t2PW += p2;
            if (p1 > p2) t1SW++; else if (p2 > p1) t2SW++;
          });

          if (stats[m.team1_id]) {
            stats[m.team1_id].setsWon += t1SW;
            stats[m.team1_id].setsLost += t2SW;
            stats[m.team1_id].pointsWon += t1PW;
            stats[m.team1_id].pointsLost += t2PW;
          }
          if (stats[m.team2_id]) {
            stats[m.team2_id].setsWon += t2SW;
            stats[m.team2_id].setsLost += t1SW;
            stats[m.team2_id].pointsWon += t2PW;
            stats[m.team2_id].pointsLost += t1PW;
          }

          const winnerId = score.winner_id;
          if (winnerId && stats[winnerId]) {
            stats[winnerId].won++;
            // Tiebreak scoring
            const loserSets = winnerId === m.team1_id ? t2SW : t1SW;
            if (loserSets === setsToWin - 1) {
              stats[winnerId].points += 2;
              const loserId = winnerId === m.team1_id ? m.team2_id : m.team1_id;
              if (stats[loserId]) stats[loserId].points += 1;
            } else {
              stats[winnerId].points += 3;
            }
          }
        });

        // Rank teams in this group
        const ranked = Object.entries(stats)
          .map(([tid, s]) => ({ teamId: tid, ...s }))
          .sort((a, b) => {
            if (b.points !== a.points) return b.points - a.points;
            if (b.won !== a.won) return b.won - a.won;
            const ratA = a.setsLost === 0 ? a.setsWon * 1000 : a.setsWon / a.setsLost;
            const ratB = b.setsLost === 0 ? b.setsWon * 1000 : b.setsWon / b.setsLost;
            if (ratB !== ratA) return ratB - ratA;
            return (b.pointsWon - b.pointsLost) - (a.pointsWon - a.pointsLost);
          });

        // Take top 2 from each group
        ranked.slice(0, 2).forEach((r, idx) => {
          const team = teams.find(t => t.id === r.teamId);
          classifiedTeams.push({
            ...r,
            teamName: team?.name || 'Unknown',
            groupRank: idx + 1 // 1 = group winner, 2 = runner-up
          });
        });
      });

      // Build unified ranking: group winners first (sorted by performance), then runners-up
      const groupWinners = classifiedTeams.filter(t => t.groupRank === 1)
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return (b.pointsWon - b.pointsLost) - (a.pointsWon - a.pointsLost);
        });

      const runnersUp = classifiedTeams.filter(t => t.groupRank === 2)
        .sort((a, b) => {
          if (b.points !== a.points) return b.points - a.points;
          return (b.pointsWon - b.pointsLost) - (a.pointsWon - a.pointsLost);
        });

      const rankedIds = [...groupWinners.map(t => t.teamId), ...runnersUp.map(t => t.teamId)];

      if (rankedIds.length < 2) {
        alert('Se necesitan al menos 2 equipos clasificados para generar las llaves.');
        setIsGeneratingPlayoffs(false);
        return;
      }

      // Generate bracket matches
      const playoffMatches = generatePlayoffBracket(rankedIds, id!, courts);

      // Insert into Supabase (remove bracket_position from the insert payload, it's in score_json)
      const insertPayload = playoffMatches.map(m => ({
        tournament_id: m.tournament_id,
        team1_id: m.team1_id || null,
        team2_id: m.team2_id || null,
        court: m.court,
        status: m.status,
        score_json: m.score_json,
        match_type: m.match_type,
        group_name: m.group_name,
        round: m.round,
      }));

      const { error: insertErr } = await supabase
        .from('matches')
        .insert(insertPayload);

      if (insertErr) throw insertErr;

      // Save playoff config
      const updatedConfig = {
        ...configJson,
        playoff_started: true,
        playoff_ranking: rankedIds,
        playoffRules: {
          regularPoints: playoffRegularPoints,
          tiebreakPoints: playoffTiebreakPoints,
          setsToWin: playoffSetsToWin,
          overtimeMode: playoffOvertimeMode,
        }
      };

      await supabase
        .from('tournaments')
        .update({ config_json: updatedConfig })
        .eq('id', id);

      setPlayoffStarted(true);
      setConfigJson(updatedConfig);
      await fetchTournamentData();
      setActiveTab('bracket');
      alert('✅ ¡Fase de llaves generada exitosamente!');
    } catch (e) {
      console.error(e);
      alert('Error al generar la fase de llaves.');
    } finally {
      setIsGeneratingPlayoffs(false);
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
                return (
                  <tr key={row.teamId} className="border-b border-zinc-900/40 last:border-0 hover:bg-zinc-900/10">
                    <td className="py-2.5 pl-1 font-bold text-zinc-200 truncate max-w-[100px] text-sm">
                      {idx + 1}. {row.teamName}
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
        {status === 'active' && userRole !== 'referee' && (
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

      <div className={`grid ${userRole === 'creator' ? 'grid-cols-5' : 'grid-cols-4'} p-1 bg-zinc-900/60 border border-zinc-850 rounded-2xl mb-6 max-w-sm mx-auto w-full`}>
        <button
          onClick={() => setActiveTab('matches')}
          className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all ${
            activeTab === 'matches' ? 'bg-zinc-800 text-orange-brand' : 'text-gray-400'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Partidos
        </button>
        <button
          onClick={() => setActiveTab('standings')}
          className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all ${
            activeTab === 'standings' ? 'bg-zinc-800 text-purple-brand' : 'text-gray-400'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          Tabla
        </button>
        <button
          onClick={() => setActiveTab('bracket')}
          className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all ${
            activeTab === 'bracket' ? 'bg-zinc-800 text-amber-400' : 'text-gray-400'
          }`}
        >
          <Swords className="w-3.5 h-3.5" />
          Llaves
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all ${
            activeTab === 'teams' ? 'bg-zinc-800 text-zinc-200' : 'text-gray-400'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Equipos
        </button>
        {userRole === 'creator' && (
          <button
            onClick={() => setActiveTab('staff')}
            className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-all ${
              activeTab === 'staff' ? 'bg-zinc-800 text-amber-450' : 'text-gray-400'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            Staff
          </button>
        )}
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
              <>
                {courts > 1 && (
                  <div className="flex items-center justify-between p-3 bg-zinc-950 border border-zinc-900 rounded-2xl mb-3">
                    <span className="text-xs text-zinc-400 font-extrabold uppercase">Filtrar Programación</span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase">Cancha:</span>
                      <select
                        value={selectedCourtFilter}
                        onChange={(e) => setSelectedCourtFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                        className="px-2 py-1 bg-zinc-900 border border-zinc-800 rounded-lg text-[10px] font-bold text-zinc-300 focus:outline-none focus:border-orange-brand"
                      >
                        <option value="all">Todas</option>
                        {Array.from({ length: courts }).map((_, idx) => (
                          <option key={idx + 1} value={idx + 1}>
                            Cancha {idx + 1}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {(() => {
                  const filteredMatches = selectedCourtFilter === 'all'
                    ? matches
                    : matches.filter(m => m.court === selectedCourtFilter);

                  if (filteredMatches.length === 0) {
                    return (
                      <div className="p-8 border border-zinc-900 border-dashed rounded-3xl text-center text-zinc-550 text-xs italic bg-zinc-950/20">
                        No hay partidos programados en la Cancha {selectedCourtFilter}
                      </div>
                    );
                  }

                  return filteredMatches.map((m) => {
                    const liveScore = m.score_json || {};
                    const currentSet = liveScore.current_set || { team1: 0, team2: 0 };
                    const setsWon = liveScore.sets_won || { team1: 0, team2: 0 };
                    const prevSets = liveScore.sets || [];

                    return (
                      <div
                        key={m.id}
                        className={`p-4 border rounded-2xl flex flex-col gap-3 mb-3 ${
                          m.status === 'in_progress' 
                            ? 'bg-zinc-950 border-orange-brand/50 shadow-md shadow-orange-brand/5'
                            : 'bg-zinc-950/40 border-zinc-900'
                        }`}
                      >
                        {/* Header line info */}
                        <div className="flex items-center justify-between border-b border-zinc-900/60 pb-2">
                          <span className="text-sm font-bold text-gray-500 uppercase tracking-wide">
                            Ronda {m.round} {m.group_name ? `• ${m.group_name}` : ''} • Cancha {m.court}
                          </span>
                          {m.status === 'in_progress' ? (
                            <span className="px-2.5 py-1 rounded bg-red-500/10 text-red-500 text-xs font-black border border-red-500/20 uppercase tracking-wider animate-pulse flex items-center gap-1">
                              En Arbitraje 🔴
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

                        {/* Team display and score */}
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

                        {/* Referee Action Button */}
                        {status === 'active' && m.status !== 'finished' && (
                          <button
                            onClick={() => navigate(`/admin/match/referee/${m.id}`)}
                            className="mt-1 flex items-center justify-center gap-1.5 py-2.5 bg-zinc-900 border border-zinc-800 hover:border-orange-brand/50 text-white font-extrabold rounded-xl text-base uppercase tracking-wider transition-all"
                          >
                            <Play className="w-3 h-3 fill-current text-orange-brand" />
                            {m.status === 'in_progress' ? 'Continuar Arbitraje' : 'Iniciar Arbitraje'}
                          </button>
                        )}
                      </div>
                    );
                  });
                })()}
              </>
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
                            <td className="py-2.5 pl-1 font-mono text-zinc-555 text-sm">{idx + 1}</td>
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

        {/* TAB 4: BRACKET / LLAVES */}
        {activeTab === 'bracket' && (
          <div className="flex flex-col gap-4">
            {!playoffStarted && !hasKnockoutMatches ? (
              <div className="flex flex-col gap-4">
                {/* Simulate button for testing */}
                {format === 'groups' && !allGroupsFinished && status === 'active' && userRole !== 'referee' && (
                  <button
                    onClick={handleSimulateAllMatches}
                    disabled={isSimulating}
                    className="w-full py-3 bg-zinc-900 border border-zinc-800 hover:border-amber-500/30 text-amber-400 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 transition-all"
                  >
                    {isSimulating ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Simulando partidos...</>
                    ) : (
                      <><Zap className="w-3.5 h-3.5" /> ⚡ Simular Partidos de Grupo (Prueba)</>
                    )}
                  </button>
                )}

                {/* Status message */}
                {!allGroupsFinished && (
                  <div className="p-6 border border-zinc-900 border-dashed rounded-3xl text-center flex flex-col gap-2">
                    <span className="text-zinc-500 text-xs">
                      ⏳ La fase de grupos aún no ha terminado.
                    </span>
                    <span className="text-zinc-650 text-[10px]">
                      {userRole === 'referee'
                        ? 'Una vez finalizados todos los partidos, el administrador generará las llaves.'
                        : `Faltan ${groupMatches.filter(m => m.status !== 'finished').length} partido(s) por finalizar.`}
                    </span>
                  </div>
                )}

                {/* Referee waiting message */}
                {allGroupsFinished && status === 'active' && userRole === 'referee' && (
                  <div className="p-6 border border-zinc-900 border-dashed rounded-3xl text-center flex flex-col gap-2 bg-zinc-950/20">
                    <span className="text-zinc-500 text-xs">
                      ⏳ Esperando generación de llaves
                    </span>
                    <span className="text-zinc-650 text-[10px]">
                      El creador o administrador del torneo debe iniciar la fase de playoffs.
                    </span>
                  </div>
                )}

                {/* Playoff rules configuration */}
                {allGroupsFinished && status === 'active' && userRole !== 'referee' && (
                  <div className="flex flex-col gap-4">
                    <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl flex flex-col gap-4">
                      <h3 className="text-sm font-extrabold text-amber-400 flex items-center gap-2">
                        <Swords className="w-4 h-4" />
                        Configurar Fase de Llaves
                      </h3>


                      {(() => {
                        // Need to get sorted letters for display
                        const groupLettersLocal = new Set<string>();
                        matches.forEach(m => {
                          if (m.group_name?.startsWith('Grupo')) {
                            const letter = m.group_name.replace('Grupo ', '').trim();
                            if (letter) groupLettersLocal.add(letter);
                          }
                        });
                        const sortedLettersLocal = Array.from(groupLettersLocal).sort();

                        return (
                          <p className="text-[10px] text-zinc-500">
                            Clasifican los 2 primeros de cada grupo ({sortedLettersLocal.length} grupos × 2 = {sortedLettersLocal.length * 2} equipos).
                            Puedes cambiar las reglas de los partidos eliminatorios.
                          </p>
                        );
                      })()}

                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-gray-400">Puntos set regular</label>
                          <select
                            value={playoffRegularPoints}
                            onChange={(e) => setPlayoffRegularPoints(Number(e.target.value))}
                            className="px-3 py-2.5 bg-zinc-900 border border-zinc-850 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                          >
                            <option value={25}>25 puntos</option>
                            <option value={21}>21 puntos</option>
                            <option value={18}>18 puntos</option>
                            <option value={15}>15 puntos</option>
                            <option value={11}>11 puntos</option>
                            <option value={9}>9 puntos</option>
                          </select>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label className="text-xs text-gray-400">Puntos desempate</label>
                          <select
                            value={playoffTiebreakPoints}
                            onChange={(e) => setPlayoffTiebreakPoints(Number(e.target.value))}
                            className="px-3 py-2.5 bg-zinc-900 border border-zinc-850 rounded-xl text-xs focus:outline-none focus:border-amber-500"
                          >
                            <option value={15}>15 puntos</option>
                            <option value={11}>11 puntos</option>
                            <option value={9}>9 puntos</option>
                            <option value={5}>5 puntos</option>
                            <option value={3}>3 puntos</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400">Sets para ganar</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPlayoffSetsToWin(2)}
                            className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                              playoffSetsToWin === 2
                                ? 'bg-zinc-900 border-amber-500 text-amber-400'
                                : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                            }`}
                          >
                            2 Sets (Mejor de 3)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlayoffSetsToWin(3)}
                            className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                              playoffSetsToWin === 3
                                ? 'bg-zinc-900 border-amber-500 text-amber-400'
                                : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                            }`}
                          >
                            3 Sets (Mejor de 5)
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs text-gray-400">Condición de Fin de Set</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setPlayoffOvertimeMode('con_alargue')}
                            className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                              playoffOvertimeMode === 'con_alargue'
                                ? 'bg-zinc-900 border-amber-500 text-amber-400'
                                : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                            }`}
                          >
                            Con alargue (Dif. 2)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPlayoffOvertimeMode('a_muerte')}
                            className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                              playoffOvertimeMode === 'a_muerte'
                                ? 'bg-zinc-900 border-amber-500 text-amber-400'
                                : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                            }`}
                          >
                            A muerte (Punto de oro)
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={handleGeneratePlayoffs}
                      disabled={isGeneratingPlayoffs}
                      className="w-full py-3.5 bg-gradient-to-r from-amber-500 to-orange-brand text-black font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 transition-all active:scale-[0.99] shadow-lg shadow-amber-500/10"
                    >
                      {isGeneratingPlayoffs ? (
                        <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generando llaves...</>
                      ) : (
                        <><Swords className="w-4 h-4" /> Generar Fase de Llaves</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <PlayoffBracket
                matches={matches}
                teams={teams}
                isAdmin={userRole !== 'referee'}
                tournamentActive={status === 'active'}
                onStartMatch={(matchId) => navigate(`/admin/match/referee/${matchId}`)}
              />
            )}
          </div>
        )}

        {/* TAB 5: STAFF */}
        {activeTab === 'staff' && userRole === 'creator' && (
          <div className="flex flex-col gap-5">
            {/* Admin Invite Card */}
            <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-3xl flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
                <div>
                  <h4 className="text-sm font-extrabold text-zinc-200">Invitación de Administradores</h4>
                  <p className="text-[10px] text-zinc-500">Pueden editar reglas, equipos y marcadores.</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleInviteLink('admin')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all ${
                    inviteAdminActive
                      ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20'
                      : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                  }`}
                >
                  {inviteAdminActive ? 'Activo' : 'Inactivo'}
                </button>
              </div>

              {inviteAdminActive ? (
                <div className="flex flex-col gap-2 mt-1">
                  <span className="text-[10px] text-zinc-400 font-mono select-all break-all p-2 bg-zinc-900/60 rounded-xl border border-zinc-850">
                    {`${window.location.origin}/admin/login?join=admin&tournamentId=${id}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyLink('admin')}
                    className="py-2.5 bg-zinc-900 border border-zinc-800 hover:text-white text-zinc-350 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                  >
                    {copyFeedbackAdmin ? '✅ ¡Copiado!' : 'Copiar Enlace'}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500 text-center py-2 italic">
                  Habilita el enlace para que otros puedan unirse como Administradores.
                </p>
              )}
            </div>

            {/* Referee Invite Card */}
            <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-3xl flex flex-col gap-3">
              <div className="flex items-center justify-between border-b border-zinc-900 pb-2.5">
                <div>
                  <h4 className="text-sm font-extrabold text-zinc-200">Invitación de Árbitros</h4>
                  <p className="text-[10px] text-zinc-500">Sólo pueden registrar resultados y arbitrar partidos.</p>
                </div>
                <button
                  type="button"
                  onClick={() => toggleInviteLink('referee')}
                  className={`px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase transition-all ${
                    inviteRefereeActive
                      ? 'bg-emerald-500/10 text-emerald-450 border border-emerald-500/20'
                      : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                  }`}
                >
                  {inviteRefereeActive ? 'Activo' : 'Inactivo'}
                </button>
              </div>

              {inviteRefereeActive ? (
                <div className="flex flex-col gap-2 mt-1">
                  <span className="text-[10px] text-zinc-400 font-mono select-all break-all p-2 bg-zinc-900/60 rounded-xl border border-zinc-850">
                    {`${window.location.origin}/admin/login?join=referee&tournamentId=${id}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyLink('referee')}
                    className="py-2.5 bg-zinc-900 border border-zinc-800 hover:text-white text-zinc-350 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 active:scale-[0.98] transition-all"
                  >
                    {copyFeedbackReferee ? '✅ ¡Copiado!' : 'Copiar Enlace'}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-zinc-500 text-center py-2 italic">
                  Habilita el enlace para que otros puedan unirse como Árbitros.
                </p>
              )}
            </div>

            {/* Current Staff List Card */}
            <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-3xl flex flex-col gap-3">
              <h4 className="text-sm font-extrabold text-zinc-200 border-b border-zinc-900 pb-2">
                Staff Actual ({collaborators.length})
              </h4>
              
              {loadingCollaborators ? (
                <div className="text-center py-6 text-zinc-500 text-xs flex items-center justify-center gap-1.5">
                  <Loader2 className="w-4 h-4 animate-spin text-orange-brand" />
                  Cargando staff...
                </div>
              ) : collaborators.length === 0 ? (
                <p className="text-[11px] text-zinc-500 text-center py-4 italic">
                  Aún no hay colaboradores en este torneo. Comparte un enlace arriba para agregarlos.
                </p>
              ) : (
                <div className="flex flex-col gap-2 max-h-[250px] overflow-y-auto pr-1">
                  {collaborators.map((collab) => (
                    <div
                      key={collab.id}
                      className="p-3 bg-zinc-900/40 border border-zinc-850 rounded-2xl flex items-center justify-between text-left"
                    >
                      <div className="flex flex-col gap-0.5 max-w-[70%]">
                        <span className="text-xs font-bold text-zinc-200 truncate">{collab.email}</span>
                        <span className={`text-[9px] font-black uppercase tracking-wider font-mono ${
                          collab.role === 'admin' ? 'text-orange-brand' : 'text-blue-400'
                        }`}>
                          {collab.role === 'admin' ? 'Administrador' : 'Árbitro'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteCollaborator(collab.id)}
                        className="p-2 rounded-xl bg-zinc-950 hover:bg-red-950/30 text-zinc-650 hover:text-red-500 transition-colors"
                        title="Eliminar del Staff"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
