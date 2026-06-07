import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { generateRoundRobin, generateGroupFixtures } from '../utils/fixtureGenerator';
import { 
  ArrowLeft, Settings, Users, Calendar, Plus, Trash2, 
  ChevronRight, Play, Loader2, Save, UserPlus, X
} from 'lucide-react';
import type { MatchModality } from '../types/sport';

interface Team {
  id: string;
  name: string;
  playerCount?: number;
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
  team1?: { name: string };
  team2?: { name: string };
}

export default function TournamentEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isLoading: authLoading } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'rules' | 'teams' | 'fixture' | 'staff'>('rules');
  const [loading, setLoading] = useState(true);
  const [tournamentName, setTournamentName] = useState('');

  // Collaborators/Role states
  const [userRole, setUserRole] = useState<'creator' | 'admin' | null>(null);
  const [configJson, setConfigJson] = useState<any>({});
  const [collaborators, setCollaborators] = useState<{ id: string, email: string, role: 'admin' | 'referee' }[]>([]);
  const [loadingCollaborators, setLoadingCollaborators] = useState(false);
  const [inviteAdminActive, setInviteAdminActive] = useState(false);
  const [inviteRefereeActive, setInviteRefereeActive] = useState(false);
  const [copyFeedbackAdmin, setCopyFeedbackAdmin] = useState(false);
  const [copyFeedbackReferee, setCopyFeedbackReferee] = useState(false);
  
  // Rules State
  const [modality, setModality] = useState<MatchModality>('6v6');
  const [courts, setCourts] = useState<number>(1);
  const [setsToWin, setSetsToWin] = useState<number>(2);
  const [regularPoints, setRegularPoints] = useState<number>(25);
  const [tiebreakPoints, setTiebreakPoints] = useState<number>(5);
  const [overtimeMode, setOvertimeMode] = useState<'con_alargue' | 'a_muerte'>('con_alargue');
  const [format, setFormat] = useState<'league' | 'groups'>('league');
  const [groupCount, setGroupCount] = useState<number>(2);
  const [groupAssignmentMode, setGroupAssignmentMode] = useState<'automatic' | 'manual'>('automatic');
  const [manualTeamsGroups, setManualTeamsGroups] = useState<{ [teamId: string]: string }>({});
  const [manualGroupsCourts, setManualGroupsCourts] = useState<{ [groupLetter: string]: number }>({});
  const [isSavingRules, setIsSavingRules] = useState(false);

  // Teams State
  const [teams, setTeams] = useState<Team[]>([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerNumber, setNewPlayerNumber] = useState('');
  const [isAddingPlayer, setIsAddingPlayer] = useState(false);

  // Fixture State
  const [matches, setMatches] = useState<Match[]>([]);
  const [isGeneratingFixture, setIsGeneratingFixture] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [selectedCourtFilter, setSelectedCourtFilter] = useState<number | 'all'>('all');

  // Scheduling and Shuffling States
  const [shuffledTeams, setShuffledTeams] = useState<Team[]>([]);
  const [isShuffling, setIsShuffling] = useState(false);
  const [startTime, setStartTime] = useState<string>(() => {
    const now = new Date();
    now.setHours(14, 0, 0, 0); // Default to today at 2:00 PM
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  });

  useEffect(() => {
    setShuffledTeams(prev => {
      const prevIds = prev.map(t => t.id).join(',');
      const teamsIds = teams.map(t => t.id).join(',');
      if (prevIds === teamsIds) return prev;
      return teams;
    });
  }, [teams]);

  const userId = user?.id;

  useEffect(() => {
    if (!authLoading && !userId) {
      navigate('/admin/login');
      return;
    }
    if (id) {
      fetchTournamentDetails();
    }
  }, [id, userId, authLoading]);

  const fetchTournamentDetails = async () => {
    setLoading(true);
    try {
      // 1. Get Tournament Config
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

      if (role === 'referee') {
        if (tData.status === 'draft') {
          alert('El torneo aún está en borrador y no ha comenzado.');
          navigate('/admin/dashboard');
        } else {
          alert('Tu rol de Árbitro sólo permite registrar marcadores. Redirigiendo...');
          navigate(`/admin/tournament/${id}/play`);
        }
        return;
      }

      setUserRole(role);
      
      // If tournament is not in draft, we directly go to play screen
      if (tData.status !== 'draft') {
        navigate(`/admin/tournament/${id}/play`);
        return;
      }

      setTournamentName(tData.name);
      
      const config = tData.config_json || {};
      setConfigJson(config);
      setInviteAdminActive(!!config.public_invite_admin);
      setInviteRefereeActive(!!config.public_invite_referee);

      setModality(config.modality || '6v6');
      setCourts(config.courts || 1);
      setSetsToWin(config.setsToWin || 2);
      setRegularPoints(config.regularPoints || 25);
      setTiebreakPoints(config.tiebreakPoints || 5);
      setOvertimeMode(config.overtimeMode || 'con_alargue');
      setFormat(config.format || 'league');
      setGroupCount(config.groupCount || 2);
      setGroupAssignmentMode(config.groupAssignmentMode || 'automatic');
      setManualTeamsGroups(config.manualTeamsGroups || {});
      setManualGroupsCourts(config.manualGroupsCourts || {});

      // 2. Get Teams
      await fetchTeams();

      // 3. Get Matches
      await fetchMatches();

      // 4. Get Collaborators if creator
      if (role === 'creator') {
        await fetchCollaborators();
      }

    } catch (e) {
      console.error('Error fetching tournament details:', e);
      alert('Error al cargar la información del torneo.');
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

  const fetchTeams = async () => {
    const { data, error } = await supabase
      .from('teams')
      .select('*, players(count)')
      .eq('tournament_id', id)
      .order('name');
    
    if (error) throw error;
    
    setTeams(data.map((t: any) => ({
      id: t.id,
      name: t.name,
      playerCount: t.players?.[0]?.count || 0
    })) || []);
  };

  const fetchMatches = async () => {
    const { data, error } = await supabase
      .from('matches')
      .select('*, team1:teams!matches_team1_id_fkey(name), team2:teams!matches_team2_id_fkey(name)')
      .eq('tournament_id', id)
      .order('scheduled_time', { ascending: true })
      .order('round', { ascending: true })
      .order('court', { ascending: true });

    if (error) throw error;
    setMatches(data || []);
  };

  // 1. SAVE RULES
  const handleSaveRules = async () => {
    setIsSavingRules(true);
    try {
      const config_json = {
        ...configJson,
        setsToWin,
        regularPoints,
        tiebreakPoints,
        modality,
        overtimeMode,
        courts,
        format,
        groupCount,
        groupAssignmentMode,
        manualTeamsGroups,
        manualGroupsCourts,
        scoring: { win_2_0: 3, win_2_1: 2, loss_2_1: 1, loss_2_0: 0 },
        tiebreak_criteria: ['point_diff', 'set_ratio', 'point_ratio', 'head_to_head']
      };

      const { error } = await supabase
        .from('tournaments')
        .update({ config_json })
        .eq('id', id);

      if (error) throw error;
      setConfigJson(config_json);
      alert('Reglas guardadas correctamente.');
    } catch (e) {
      console.error('Error saving rules:', e);
      alert('Error al guardar las reglas.');
    } finally {
      setIsSavingRules(false);
    }
  };

  // 2. TEAMS MANAGEMENT
  const handleAddTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;

    setIsAddingTeam(true);
    try {
      const { error } = await supabase
        .from('teams')
        .insert({
          tournament_id: id,
          name: newTeamName.trim()
        });

      if (error) throw error;
      setNewTeamName('');
      await fetchTeams();
    } catch (e) {
      console.error('Error adding team:', e);
      alert('No se pudo agregar el equipo.');
    } finally {
      setIsAddingTeam(false);
    }
  };

  const handleDeleteTeam = async (teamId: string) => {
    if (!confirm('¿Seguro que deseas eliminar este equipo? Se eliminarán también sus jugadores.')) return;
    try {
      const { error } = await supabase.from('teams').delete().eq('id', teamId);
      if (error) throw error;
      await fetchTeams();
      if (selectedTeam?.id === teamId) {
        setSelectedTeam(null);
        setPlayers([]);
      }
    } catch (e) {
      console.error(e);
      alert('Error al eliminar equipo.');
    }
  };

  const handleSelectTeam = async (team: Team) => {
    if (selectedTeam?.id === team.id) {
      setSelectedTeam(null);
      setPlayers([]);
      return;
    }
    setSelectedTeam(team);
    try {
      const { data, error } = await supabase
        .from('players')
        .select('*')
        .eq('team_id', team.id)
        .order('name');
      
      if (error) throw error;
      setPlayers(data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerName.trim() || !selectedTeam) return;

    setIsAddingPlayer(true);
    try {
      const num = newPlayerNumber ? parseInt(newPlayerNumber) : null;
      const { error } = await supabase
        .from('players')
        .insert({
          team_id: selectedTeam.id,
          name: newPlayerName.trim(),
          number: num
        });

      if (error) throw error;
      setNewPlayerName('');
      setNewPlayerNumber('');
      
      // refresh
      await handleSelectTeam(selectedTeam);
      await fetchTeams(); // Refresh counts
    } catch (e) {
      console.error(e);
      alert('Error al agregar jugador.');
    } finally {
      setIsAddingPlayer(false);
    }
  };

  const handleDeletePlayer = async (playerId: string) => {
    try {
      const { error } = await supabase.from('players').delete().eq('id', playerId);
      if (error) throw error;
      if (selectedTeam) {
        await handleSelectTeam(selectedTeam);
        await fetchTeams();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleLoadMockData = async () => {
    setIsAddingTeam(true);
    try {
      const mockTeams = ["Cuervos Voley", "Titanes", "Los Ases", "Bloqueo Total", "Red Devils", "Set & Match"];
      const insertedTeams = [];

      for (const name of mockTeams) {
        const { data, error } = await supabase
          .from('teams')
          .insert({ tournament_id: id, name })
          .select()
          .single();
        if (error) throw error;
        insertedTeams.push(data);
      }

      // Now insert players for each team
      const playerNames = ["Carlos", "Mateo", "Juan", "Lucas", "Andrés", "Daniel"];
      const insertPlayers = [];

      for (const team of insertedTeams) {
        for (let i = 0; i < playerNames.length; i++) {
          insertPlayers.push({
            team_id: team.id,
            name: `${playerNames[i]} (${team.name.split(' ')[0]})`,
            number: i + 1
          });
        }
      }

      const { error: pErr } = await supabase.from('players').insert(insertPlayers);
      if (pErr) throw pErr;

      await fetchTeams();
      alert('¡Equipos y jugadores demo cargados con éxito!');
    } catch (e) {
      console.error(e);
      alert('Error al cargar datos demo.');
    } finally {
      setIsAddingTeam(false);
    }
  };

  // 2.5 SORTEO DE GRUPOS
  const handleShuffleGroups = () => {
    if (teams.length < 2) return;
    setIsShuffling(true);
    let count = 0;
    const interval = setInterval(() => {
      setShuffledTeams(prev => [...prev].sort(() => Math.random() - 0.5));
      count++;
      if (count >= 15) {
        clearInterval(interval);
        setIsShuffling(false);
      }
    }, 80);
  };

  // 3. GENERACIÓN DE PARTIDOS
  const handleGenerateFixture = async () => {
    if (teams.length < 2) {
      alert('Necesitas al menos 2 equipos registrados para generar los partidos.');
      return;
    }

    if (format === 'groups' && teams.length < groupCount * 2) {
      alert(`Para grupos necesitas al menos ${groupCount * 2} equipos (mínimo 2 por grupo).`);
      return;
    }

    const confirmGen = confirm('¿Generar nuevo calendario de partidos? Esto borrará cualquier partido previamente programado en este torneo.');
    if (!confirmGen) return;

    setIsGeneratingFixture(true);
    try {
      // 1. Delete existing matches
      const { error: delErr } = await supabase
        .from('matches')
        .delete()
        .eq('tournament_id', id);

      if (delErr) throw delErr;

      // 2. Generate new matches
      const teamIds = shuffledTeams.map(t => t.id);
      let newMatches: any[] = [];

      if (format === 'league') {
        newMatches = generateRoundRobin(teamIds, id!, courts);
      } else {
        if (groupAssignmentMode === 'manual') {
          // Construct manualGroups mapping
          const manualGroups: { [groupLetter: string]: string[] } = {};
          for (let i = 0; i < groupCount; i++) {
            const letter = String.fromCharCode(65 + i);
            manualGroups[letter] = [];
          }
          teams.forEach((team) => {
            const letter = manualTeamsGroups[team.id] || 'A';
            if (manualGroups[letter]) {
              manualGroups[letter].push(team.id);
            } else {
              manualGroups['A'].push(team.id);
            }
          });

          // Validate that all groups have at least 2 teams
          const underLimitGroups = Object.entries(manualGroups).filter(([_, ids]) => ids.length < 2);
          if (underLimitGroups.length > 0 && teams.length >= groupCount * 2) {
            const underGroupsNames = underLimitGroups.map(([letter]) => `Grupo ${letter}`).join(', ');
            alert(`Para generar los partidos, cada grupo debe tener al menos 2 equipos. Revisa: ${underGroupsNames}`);
            setIsGeneratingFixture(false);
            return;
          }

          // Construct finalGroupsCourts mapping
          const finalGroupsCourts: { [groupLetter: string]: number } = {};
          for (let i = 0; i < groupCount; i++) {
            const letter = String.fromCharCode(65 + i);
            finalGroupsCourts[letter] = manualGroupsCourts[letter] !== undefined 
              ? manualGroupsCourts[letter] 
              : (i % courts) + 1;
          }

          newMatches = generateGroupFixtures(
            teamIds,
            id!,
            courts,
            groupCount,
            manualGroups,
            finalGroupsCourts
          );
        } else {
          newMatches = generateGroupFixtures(teamIds, id!, courts, groupCount);
        }
      }

      // 2.5 Assign scheduled times consecutively per court
      if (newMatches.length > 0) {
        const getMatchDuration = (pts: number): number => {
          if (pts <= 9) return 15;
          if (pts <= 11) return 20;
          if (pts <= 15) return 25;
          if (pts <= 21) return 30;
          return 35;
        };

        const durationMinutes = getMatchDuration(regularPoints);
        const baseDate = startTime ? new Date(startTime) : new Date();
        const courtNextTime: { [court: number]: Date } = {};
        for (let c = 1; c <= courts; c++) {
          courtNextTime[c] = new Date(baseDate);
        }

        newMatches.forEach((match) => {
          const court = match.court || 1;
          const matchTime = new Date(courtNextTime[court]);
          match.scheduled_time = matchTime.toISOString();
          courtNextTime[court] = new Date(matchTime.getTime() + durationMinutes * 60000);
        });

        // 2.8 Update the tournament's config_json with the current format and groupCount
        const config_json = {
          setsToWin,
          regularPoints,
          tiebreakPoints,
          modality,
          overtimeMode,
          courts,
          format,
          groupCount,
          groupAssignmentMode,
          manualTeamsGroups,
          manualGroupsCourts,
          scoring: { win_2_0: 3, win_2_1: 2, loss_2_1: 1, loss_2_0: 0 },
          tiebreak_criteria: ['point_diff', 'set_ratio', 'point_ratio', 'head_to_head']
        };

        const { error: tConfigErr } = await supabase
          .from('tournaments')
          .update({ config_json })
          .eq('id', id);

        if (tConfigErr) throw tConfigErr;

        // 3. Insert matches in Supabase
        const { error: insErr } = await supabase
          .from('matches')
          .insert(newMatches);

        if (insErr) throw insErr;
      }

      await fetchMatches();
      alert('¡Partidos generados con éxito!');
    } catch (e) {
      console.error('Error generating matches:', e);
      alert('Error al generar los partidos.');
    } finally {
      setIsGeneratingFixture(false);
    }
  };

  // 4. ACTIVATE TOURNAMENT (PLAY TORNEO)
  const handleActivateTournament = async () => {
    if (teams.length < 2) {
      alert('Necesitas al menos 2 equipos para iniciar el torneo.');
      return;
    }
    if (matches.length === 0) {
      alert('Debes generar los partidos en la pestaña "Partidos" antes de iniciar el torneo.');
      return;
    }

    const confirmAct = confirm('¿Iniciar torneo? Esto cambiará el estado a ACTIVO. No podrás añadir/eliminar equipos ni cambiar las reglas deportivas una vez iniciado.');
    if (!confirmAct) return;

    setIsActivating(true);
    try {
      const config_json = {
        setsToWin,
        regularPoints,
        tiebreakPoints,
        modality,
        overtimeMode,
        courts,
        format,
        groupCount,
        groupAssignmentMode,
        manualTeamsGroups,
        manualGroupsCourts,
        scoring: { win_2_0: 3, win_2_1: 2, loss_2_1: 1, loss_2_0: 0 },
        tiebreak_criteria: ['point_diff', 'set_ratio', 'point_ratio', 'head_to_head']
      };

      const { error } = await supabase
        .from('tournaments')
        .update({ 
          status: 'active',
          config_json
        })
        .eq('id', id);

      if (error) throw error;
      navigate(`/admin/tournament/${id}/play`);
    } catch (e) {
      console.error('Error activating tournament:', e);
      alert('Error al activar el torneo.');
    } finally {
      setIsActivating(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white font-sans">
        <Loader2 className="w-6 h-6 animate-spin text-orange-brand" />
      </div>
    );
  }

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
            <span className="text-[10px] text-orange-brand font-bold uppercase tracking-wider">Fase de Edición</span>
          </div>
        </div>

        {/* Start Game Action */}
        <button
          onClick={handleActivateTournament}
          disabled={isActivating || matches.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-bold rounded-xl text-[10px] disabled:opacity-40"
        >
          {isActivating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 fill-current" />}
          Iniciar Torneo
        </button>
      </div>

      {/* Tabs */}
      <div className={`grid ${userRole === 'creator' ? 'grid-cols-4' : 'grid-cols-3'} p-1 bg-zinc-900/60 border border-zinc-850 rounded-2xl mb-6 max-w-sm mx-auto w-full`}>
        <button
          onClick={() => setActiveTab('rules')}
          className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'rules' ? 'bg-zinc-800 text-orange-brand' : 'text-gray-400'
          }`}
        >
          <Settings className="w-3.5 h-3.5" />
          Reglas
        </button>
        <button
          onClick={() => setActiveTab('teams')}
          className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'teams' ? 'bg-zinc-800 text-purple-brand' : 'text-gray-400'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Equipos
        </button>
        <button
          onClick={() => setActiveTab('fixture')}
          className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
            activeTab === 'fixture' ? 'bg-zinc-800 text-zinc-200' : 'text-gray-400'
          }`}
        >
          <Calendar className="w-3.5 h-3.5" />
          Partidos
        </button>
        {userRole === 'creator' && (
          <button
            onClick={() => setActiveTab('staff')}
            className={`py-2.5 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-all ${
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
        
        {/* TAB 1: RULES */}
        {activeTab === 'rules' && (
          <div className="flex flex-col gap-5">
            <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl flex flex-col gap-4">
              <h3 className="text-sm font-extrabold text-zinc-300">Configuración Deportiva</h3>

              {/* Courts count */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400">Cantidad de canchas</label>
                <select
                  value={courts}
                  onChange={(e) => setCourts(Number(e.target.value))}
                  className="px-3 py-2.5 bg-zinc-900 border border-zinc-850 rounded-xl text-xs focus:outline-none focus:border-orange-brand"
                >
                  {[1, 2, 3, 4, 5, 6].map(n => (
                    <option key={n} value={n}>{n} Cancha{n > 1 ? 's' : ''}</option>
                  ))}
                </select>
              </div>

              {/* Sets to win */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400">Sets para ganar</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSetsToWin(2)}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      setsToWin === 2
                        ? 'bg-zinc-900 border-orange-brand text-orange-brand'
                        : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                    }`}
                  >
                    2 Sets (Mejor de 3)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSetsToWin(3)}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      setsToWin === 3
                        ? 'bg-zinc-900 border-orange-brand text-orange-brand'
                        : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                    }`}
                  >
                    3 Sets (Mejor de 5)
                  </button>
                </div>
              </div>

              {/* Points */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400">Puntos set regular</label>
                  <select
                    value={regularPoints}
                    onChange={(e) => setRegularPoints(Number(e.target.value))}
                    className="px-3 py-2.5 bg-zinc-900 border border-zinc-850 rounded-xl text-xs focus:outline-none focus:border-orange-brand"
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
                  <label className="text-xs text-gray-400">Puntos set desempate</label>
                  <select
                    value={tiebreakPoints}
                    onChange={(e) => setTiebreakPoints(Number(e.target.value))}
                    className="px-3 py-2.5 bg-zinc-900 border border-zinc-850 rounded-xl text-xs focus:outline-none focus:border-purple-brand"
                  >
                    <option value={3}>3 puntos</option>
                    <option value={5}>5 puntos</option>
                    <option value={9}>9 puntos</option>
                    <option value={11}>11 puntos</option>
                  </select>
                </div>
              </div>

              {/* Overtime Type */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400">Condición de Fin de Set</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setOvertimeMode('con_alargue')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      overtimeMode === 'con_alargue'
                        ? 'bg-zinc-900 border-orange-brand text-orange-brand'
                        : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                    }`}
                  >
                    Con alargue (Dif. 2)
                  </button>
                  <button
                    type="button"
                    onClick={() => setOvertimeMode('a_muerte')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      overtimeMode === 'a_muerte'
                        ? 'bg-zinc-900 border-orange-brand text-orange-brand'
                        : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                    }`}
                  >
                    A muerte (Punto de oro)
                  </button>
                </div>
              </div>

              {/* Modality */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400">Modalidad</label>
                <div className="grid grid-cols-5 gap-1">
                  {(['2v2', '3v3', '4v4', '5v5', '6v6'] as MatchModality[]).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setModality(mode)}
                      className={`py-1.5 text-[10px] font-extrabold rounded-lg border transition-all ${
                        modality === mode
                          ? 'bg-zinc-900 border-purple-brand text-purple-brand'
                          : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                      }`}
                    >
                      {mode}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleSaveRules}
              disabled={isSavingRules}
              className="flex items-center justify-center gap-1.5 w-full py-3.5 bg-zinc-900 border border-zinc-800 hover:text-white text-gray-300 font-bold rounded-2xl text-xs"
            >
              {isSavingRules ? <Loader2 className="w-4 h-4 animate-spin text-orange-brand" /> : <Save className="w-4 h-4" />}
              Guardar Ajustes
            </button>
          </div>
        )}

        {/* TAB 2: TEAMS */}
        {activeTab === 'teams' && (
          <div className="flex flex-col gap-4">
            
            {/* Add Team form */}
            <form onSubmit={handleAddTeam} className="flex gap-2">
              <input
                type="text"
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="Nombre del nuevo equipo"
                required
                className="flex-grow px-3 py-2.5 bg-zinc-950 border border-zinc-900 rounded-xl text-xs text-white focus:outline-none focus:border-purple-brand"
              />
              <button
                type="submit"
                disabled={isAddingTeam || !newTeamName.trim()}
                className="px-4 py-2.5 bg-purple-brand text-white font-bold rounded-xl text-xs flex items-center justify-center disabled:opacity-40"
              >
                {isAddingTeam ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
            </form>

            <button
              type="button"
              onClick={handleLoadMockData}
              disabled={isAddingTeam}
              className="w-full py-2 bg-zinc-900 border border-zinc-800 text-[10px] uppercase font-bold text-purple-brand hover:bg-zinc-850 rounded-xl"
            >
              Cargar Equipos Demo / Mock
            </button>

            {/* Teams lists */}
            <div className="flex flex-col gap-2">
              {teams.length === 0 ? (
                <div className="p-8 border border-zinc-900 border-dashed rounded-2xl text-center text-zinc-500 text-xs">
                  Aún no hay equipos agregados en este torneo.
                </div>
              ) : (
                teams.map((team) => (
                  <div key={team.id} className="flex flex-col border border-zinc-900 bg-zinc-950/20 rounded-2xl overflow-hidden">
                    <div
                      className={`flex items-center justify-between p-3.5 cursor-pointer transition-colors ${
                        selectedTeam?.id === team.id ? 'bg-zinc-950 border-b border-zinc-900' : 'hover:bg-zinc-950/50'
                      }`}
                      onClick={() => handleSelectTeam(team)}
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-zinc-500 text-xs font-bold">
                          {team.playerCount} jug.
                        </span>
                        <h4 className="font-bold text-sm text-zinc-200">{team.name}</h4>
                      </div>
                      <div className="flex items-center gap-2">
                        <ChevronRight className={`w-4 h-4 text-zinc-500 transition-transform ${selectedTeam?.id === team.id ? 'rotate-90' : ''}`} />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTeam(team.id);
                          }}
                          className="p-1 rounded-lg text-zinc-650 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* PLAYERS SUB-MENU FOR SELECTED TEAM */}
                    {selectedTeam?.id === team.id && (
                      <div className="p-4 bg-zinc-950/70 border-t border-zinc-900/20 flex flex-col gap-3">
                        <span className="text-[10px] font-bold text-purple-brand uppercase tracking-wider">Jugadores</span>
                        
                        {/* Players list */}
                        {players.length === 0 ? (
                          <p className="text-[10px] text-zinc-500 text-center py-1">Sin jugadores asignados</p>
                        ) : (
                          <div className="flex flex-col gap-1.5">
                            {players.map(p => (
                              <div key={p.id} className="flex items-center justify-between bg-zinc-900/40 p-2 rounded-xl border border-zinc-850/50">
                                <span className="text-xs font-semibold text-zinc-300">
                                  {p.number !== null && p.number !== undefined ? `#${p.number} ` : ''}{p.name}
                                </span>
                                <button
                                  onClick={() => handleDeletePlayer(p.id)}
                                  className="text-zinc-650 hover:text-red-400 p-1"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Add player form */}
                        <form onSubmit={handleAddPlayer} className="flex gap-1.5 mt-2">
                          <input
                            type="text"
                            value={newPlayerName}
                            onChange={(e) => setNewPlayerName(e.target.value)}
                            placeholder="Nombre jugador"
                            required
                            className="flex-grow px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white focus:outline-none"
                          />
                          <input
                            type="number"
                            value={newPlayerNumber}
                            onChange={(e) => setNewPlayerNumber(e.target.value)}
                            placeholder="#"
                            className="w-12 px-1.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white text-center focus:outline-none"
                          />
                          <button
                            type="submit"
                            disabled={isAddingPlayer || !newPlayerName.trim()}
                            className="px-2.5 py-1.5 bg-zinc-900 border border-zinc-800 rounded-lg text-zinc-400 hover:text-white"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: PARTIDOS */}
        {activeTab === 'fixture' && (
          <div className="flex flex-col gap-5">
            <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl flex flex-col gap-4">
              <h3 className="text-sm font-extrabold text-zinc-300">Programación de Partidos</h3>

              {/* Tournament Format */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-gray-400">Formato del Torneo</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormat('league')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      format === 'league'
                        ? 'bg-zinc-900 border-zinc-300 text-zinc-200'
                        : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                    }`}
                  >
                    Liga (Todos contra todos)
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormat('groups')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      format === 'groups'
                        ? 'bg-zinc-900 border-zinc-300 text-zinc-200'
                        : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                    }`}
                  >
                    Fase de Grupos
                  </button>
                </div>
              </div>

              {/* Group selection */}
              {format === 'groups' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-gray-400">Cantidad de Grupos</label>
                  <select
                    value={groupCount}
                    onChange={(e) => setGroupCount(Number(e.target.value))}
                    className="px-3 py-2.5 bg-zinc-900 border border-zinc-850 rounded-xl text-xs focus:outline-none focus:border-zinc-500"
                  >
                    <option value={2}>2 Grupos</option>
                    <option value={3}>3 Grupos</option>
                    <option value={4}>4 Grupos</option>
                    <option value={5}>5 Grupos</option>
                    <option value={6}>6 Grupos</option>
                  </select>
                </div>
              )}

              {/* Scheduling Details */}
              <div className="flex flex-col gap-1.5 border-t border-zinc-900 pt-3">
                <label className="text-xs text-gray-400">Fecha y Hora de Inicio del Torneo</label>
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="px-3 py-2 bg-zinc-900 border border-zinc-850 rounded-xl text-xs text-white focus:outline-none focus:border-orange-brand"
                />
                {(() => {
                  const getMatchDuration = (pts: number): number => {
                    if (pts <= 9) return 15;
                    if (pts <= 11) return 20;
                    if (pts <= 15) return 25;
                    if (pts <= 21) return 30;
                    return 35;
                  };
                  return (
                    <span className="text-[10px] text-zinc-500 leading-relaxed">
                      ⏱️ <strong>Tiempo estimado:</strong> {getMatchDuration(regularPoints)} min por partido (Sets a {regularPoints} pts). Los partidos simultáneos compartirán horario.
                    </span>
                  );
                })()}
              </div>

            </div>

            {/* Group Assignment Mode Selector */}
            {format === 'groups' && teams.length >= 2 && (
              <div className="flex flex-col gap-1.5 p-4 bg-zinc-950 border border-zinc-900 rounded-2xl">
                <label className="text-xs text-gray-400">Distribución de Grupos</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setGroupAssignmentMode('automatic')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      groupAssignmentMode === 'automatic'
                        ? 'bg-zinc-900 border-zinc-300 text-zinc-200'
                        : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                    }`}
                  >
                    Sorteo Automático 🎲
                  </button>
                  <button
                    type="button"
                    onClick={() => setGroupAssignmentMode('manual')}
                    className={`py-2 text-xs font-bold rounded-lg border transition-all ${
                      groupAssignmentMode === 'manual'
                        ? 'bg-zinc-900 border-zinc-300 text-zinc-200'
                        : 'bg-zinc-900/40 border-zinc-900 text-gray-500'
                    }`}
                  >
                    Asignación Manual 📝
                  </button>
                </div>
              </div>
            )}

            {/* Groups layout visualizer (Automatic Mode) */}
            {format === 'groups' && teams.length >= 2 && groupAssignmentMode === 'automatic' && (
              <div className="flex flex-col gap-3 p-4 bg-zinc-950 border border-zinc-900 rounded-2xl relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-purple-brand">
                    Distribución de Grupos
                  </h4>
                  <button
                    type="button"
                    onClick={handleShuffleGroups}
                    disabled={isShuffling || teams.length < 2}
                    className="px-2.5 py-1 bg-zinc-900 border border-zinc-800 hover:border-purple-brand text-[9px] font-extrabold text-zinc-300 rounded-lg flex items-center gap-1 transition-all active:scale-95"
                  >
                    {isShuffling ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin text-purple-brand" />
                        Sorteando...
                      </>
                    ) : (
                      'Sorteo de Grupos 🎲'
                    )}
                  </button>
                </div>

                <div className={`grid grid-cols-2 gap-3 transition-all duration-300 ${isShuffling ? 'opacity-70 scale-[0.98] blur-[0.2px]' : ''}`}>
                  {(() => {
                    const alph = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                    const groupList: { [key: string]: Team[] } = {};
                    for (let i = 0; i < groupCount; i++) {
                      groupList[alph[i]] = [];
                    }
                    shuffledTeams.forEach((team, index) => {
                      const groupLetter = alph[index % groupCount];
                      if (groupList[groupLetter]) {
                        groupList[groupLetter].push(team);
                      }
                    });

                    return Object.entries(groupList).map(([letter, groupTeams]) => (
                      <div key={letter} className="p-3 bg-zinc-900/60 border border-zinc-850 rounded-xl flex flex-col gap-1.5">
                        <span className="text-[10px] font-black text-zinc-300 uppercase border-b border-zinc-800 pb-1">
                          Grupo {letter}
                        </span>
                        {groupTeams.length === 0 ? (
                          <span className="text-[9px] text-zinc-650 italic">Sin equipos</span>
                        ) : (
                          <div className="flex flex-col gap-0.5">
                            {groupTeams.map((team, idx) => (
                              <span key={team.id} className="text-[11px] font-medium text-zinc-450 truncate">
                                {idx + 1}. {team.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {/* Manual Assignment Panel */}
            {format === 'groups' && teams.length >= 2 && groupAssignmentMode === 'manual' && (
              <div className="flex flex-col gap-4 p-4 bg-zinc-950 border border-zinc-900 rounded-2xl">
                <div>
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-purple-brand">
                    Asignación de Equipos a Grupos
                  </h4>
                  <p className="text-[10px] text-zinc-500 mt-1">
                    Selecciona a qué grupo pertenece cada equipo registrado.
                  </p>
                </div>

                <div className="flex flex-col gap-2 max-h-[220px] overflow-y-auto pr-1">
                  {teams.map((team) => {
                    const currentGroup = manualTeamsGroups[team.id] || 'A';
                    return (
                      <div key={team.id} className="flex items-center justify-between p-2.5 bg-zinc-900/60 border border-zinc-850 rounded-xl">
                        <span className="text-xs font-semibold text-zinc-300 truncate max-w-[180px]">
                          {team.name}
                        </span>
                        <select
                          value={currentGroup}
                          onChange={(e) => {
                            const newGroup = e.target.value;
                            setManualTeamsGroups(prev => ({
                              ...prev,
                              [team.id]: newGroup
                            }));
                          }}
                          className="px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-350 focus:outline-none focus:border-purple-brand"
                        >
                          {Array.from({ length: groupCount }).map((_, idx) => {
                            const letter = String.fromCharCode(65 + idx);
                            return (
                              <option key={letter} value={letter}>
                                Grupo {letter}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    );
                  })}
                </div>

                {/* Courts Assignment for Groups */}
                <div className="border-t border-zinc-900 pt-3 flex flex-col gap-3">
                  <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-wider text-orange-brand">
                      Asignación de Grupos a Canchas
                    </h4>
                    <p className="text-[10px] text-zinc-500 mt-1">
                      Define la cancha fija para cada grupo.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    {Array.from({ length: groupCount }).map((_, idx) => {
                      const letter = String.fromCharCode(65 + idx);
                      const currentCourt = manualGroupsCourts[letter] !== undefined 
                        ? manualGroupsCourts[letter] 
                        : (idx % courts) + 1;
                      return (
                        <div key={letter} className="flex flex-col gap-1.5 p-2.5 bg-zinc-900/60 border border-zinc-850 rounded-xl">
                          <span className="text-[11px] font-black text-zinc-350 uppercase">Grupo {letter}</span>
                          <select
                            value={currentCourt}
                            onChange={(e) => {
                              const newCourt = Number(e.target.value);
                              setManualGroupsCourts(prev => ({
                                ...prev,
                                [letter]: newCourt
                              }));
                            }}
                            className="px-2 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-350 focus:outline-none focus:border-orange-brand"
                          >
                            {Array.from({ length: courts }).map((_, cIdx) => {
                              const courtNum = cIdx + 1;
                              return (
                                <option key={courtNum} value={courtNum}>
                                  Cancha {courtNum}
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* Generate Button */}
            <button
              type="button"
              onClick={handleGenerateFixture}
              disabled={isGeneratingFixture || teams.length < 2}
              className="w-full py-3.5 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-extrabold rounded-xl text-xs flex items-center justify-center gap-1.5 disabled:opacity-40 transition-all active:scale-[0.99] shadow-lg shadow-purple-brand/10"
            >
              {isGeneratingFixture ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Generando partidos...
                </>
              ) : (
                'Generar Calendario Oficial'
              )}
            </button>

            {/* Generated Matches list */}
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-1">
                <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500 flex items-center gap-1.5">
                  Calendario Programado ({matches.length} partidos)
                </h4>
                {matches.length > 0 && courts > 1 && (
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Cancha:</span>
                    <select
                      value={selectedCourtFilter}
                      onChange={(e) => setSelectedCourtFilter(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                      className="px-2 py-1 bg-zinc-900 border border-zinc-805 rounded-lg text-[10px] font-bold text-zinc-300 focus:outline-none focus:border-orange-brand"
                    >
                      <option value="all">Todas</option>
                      {Array.from({ length: courts }).map((_, idx) => (
                        <option key={idx + 1} value={idx + 1}>
                          Cancha {idx + 1}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {matches.length === 0 ? (
                <div className="p-8 border border-zinc-900 border-dashed rounded-2xl text-center text-zinc-500 text-xs bg-zinc-950/10">
                  Presiona "Generar Calendario" para programar automáticamente los enfrentamientos.
                </div>
              ) : (
                <div className="flex flex-col gap-2 max-h-[300px] overflow-y-auto pr-1">
                  {(() => {
                    const filteredMatches = selectedCourtFilter === 'all'
                      ? matches
                      : matches.filter(m => m.court === selectedCourtFilter);
                    
                    if (filteredMatches.length === 0) {
                      return (
                        <div className="p-6 border border-zinc-900 border-dashed rounded-2xl text-center text-zinc-650 text-[11px] italic">
                          No hay partidos programados en la Cancha {selectedCourtFilter}
                        </div>
                      );
                    }
                    
                    return filteredMatches.map((m) => (
                      <div key={m.id} className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl flex items-center justify-between text-left">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">
                            Ronda {m.round} {m.group_name ? `• ${m.group_name}` : ''}
                          </span>
                          <h5 className="font-semibold text-xs text-zinc-200">
                            {m.team1?.name || 'Equipo 1'} vs {m.team2?.name || 'Equipo 2'}
                          </h5>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className="text-[9px] font-bold font-mono bg-zinc-900 px-2 py-1 rounded text-zinc-400">
                            Cancha {m.court}
                          </span>
                          {m.scheduled_time && (
                            <span className="text-[9px] font-bold font-mono text-orange-brand flex items-center gap-1">
                              🕒 {new Date(m.scheduled_time).toLocaleDateString('es-ES', {
                                day: 'numeric',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true
                              })}
                            </span>
                          )}
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </div>

          </div>
        )}

        {/* TAB 4: STAFF */}
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
