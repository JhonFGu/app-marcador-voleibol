import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../supabaseClient';
import { LogOut, Trophy, Plus, Trash2, Calendar, Loader2, ArrowRight } from 'lucide-react';

interface Tournament {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'finished';
  config_json: any;
  created_at: string;
}

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { user, logout, isLoading: authLoading } = useAuthStore();

  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTournamentName, setNewTournamentName] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load tournaments list
  const fetchTournaments = async (userId: string) => {
    setLoadingList(true);
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .eq('created_by', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTournaments(data || []);
    } catch (e) {
      console.error('Error fetching tournaments:', e);
    } finally {
      setLoadingList(false);
    }
  };

  const userId = user?.id;

  useEffect(() => {
    if (!authLoading && !userId) {
      navigate('/admin/login');
    } else if (userId) {
      fetchTournaments(userId);
    }
  }, [userId, authLoading, navigate]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTournamentName.trim() || !user) return;

    setIsCreating(true);
    try {
      const defaultConfig = {
        setsToWin: 2,
        regularPoints: 25,
        tiebreakPoints: 5,
        modality: '6v6',
        overtimeMode: 'con_alargue',
        courts: 1,
        format: 'league',
        groupCount: 2,
        scoring: { win_2_0: 3, win_2_1: 2, loss_2_1: 1, loss_2_0: 0 },
        tiebreak_criteria: ['point_diff', 'set_ratio', 'point_ratio', 'head_to_head']
      };

      const { data, error } = await supabase
        .from('tournaments')
        .insert({
          name: newTournamentName.trim(),
          created_by: user.id,
          status: 'draft',
          config_json: defaultConfig
        })
        .select()
        .single();

      if (error) throw error;

      setShowCreateModal(false);
      setNewTournamentName('');
      // Navigate to the edit/draft page
      navigate(`/admin/tournament/${data.id}/edit`);
    } catch (e) {
      console.error('Error creating tournament:', e);
      alert('No se pudo crear el torneo. Inténtalo de nuevo.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este torneo? Se borrarán todos los equipos, jugadores y partidos asociados de forma permanente.')) return;
    
    setDeletingId(id);
    try {
      const { error } = await supabase.from('tournaments').delete().eq('id', id);
      if (error) throw error;

      setTournaments(tournaments.filter(t => t.id !== id));
    } catch (e) {
      console.error('Error deleting tournament:', e);
      alert('Error al eliminar el torneo.');
    } finally {
      setDeletingId(null);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white font-sans">
        Cargando...
      </div>
    );
  }

  const getStatusBadge = (status: Tournament['status']) => {
    switch (status) {
      case 'draft':
        return (
          <span className="px-2 py-0.5 text-xs font-bold rounded bg-amber-500/10 text-amber-500 border border-amber-500/20 uppercase">
            Borrador
          </span>
        );
      case 'active':
        return (
          <span className="px-2 py-0.5 text-xs font-bold rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase">
            Activo
          </span>
        );
      case 'finished':
        return (
          <span className="px-2 py-0.5 text-xs font-bold rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 uppercase">
            Finalizado
          </span>
        );
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans select-none relative">
      
      {/* Header */}
      <div className="flex items-center justify-between py-3 border-b border-zinc-900 mb-6 bg-zinc-950/40 px-3 rounded-2xl">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-gradient-to-tr from-orange-brand to-purple-brand rounded-xl">
            <Trophy className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight">PuntosVolley Admin</h1>
            <span className="text-xs text-gray-500 font-mono">{user.email}</span>
          </div>
        </div>

        <button
          onClick={() => logout()}
          className="p-2.5 bg-zinc-900 border border-zinc-800 rounded-xl text-red-400 hover:text-red-300 hover:bg-zinc-800 transition-colors"
          title="Cerrar Sesión"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Action panel */}
      <div className="flex-grow flex flex-col gap-6 max-w-md mx-auto w-full">
        {/* Banner Card */}
        <div className="p-5 bg-gradient-to-r from-orange-brand/10 to-purple-brand/10 border border-zinc-850 rounded-2xl flex flex-col gap-4">
          <div>
            <h2 className="text-lg font-bold">Gestión de Torneos</h2>
            <p className="text-sm text-gray-400">Crea torneos oficiales, programa partidos y arbitra en vivo.</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 py-3.5 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-bold rounded-xl text-base hover:opacity-90 transition-all active:scale-[0.98]"
          >
            <Plus className="w-4 h-4" />
            Crear Nuevo Torneo
          </button>
        </div>

        {/* Tournaments List */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-zinc-500 px-1">Tus Torneos</h3>
          
          {loadingList ? (
            <div className="text-center py-12 text-zinc-500 text-sm flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Cargando torneos...
            </div>
          ) : tournaments.length === 0 ? (
            <div className="p-8 border border-zinc-900 border-dashed rounded-2xl text-center flex flex-col items-center justify-center bg-zinc-950/20">
              <span className="text-3xl mb-2">🏐</span>
              <h4 className="text-base font-bold text-zinc-400 mb-1">Sin torneos creados</h4>
              <p className="text-sm text-zinc-500 max-w-[200px] mx-auto leading-relaxed">
                Presiona el botón de arriba para configurar tu primer torneo de voleibol.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {tournaments.map((t) => (
                <div
                  key={t.id}
                  className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl hover:border-zinc-800 transition-colors flex items-center justify-between group"
                >
                  <div className="flex flex-col gap-1 text-left max-w-[70%]">
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-base text-zinc-150 truncate max-w-[150px]">{t.name}</h4>
                      {getStatusBadge(t.status)}
                    </div>
                    <span className="text-sm text-zinc-500 font-mono flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-zinc-650" />
                      {new Date(t.created_at).toLocaleDateString('es-ES', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      })}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => navigate(t.status === 'draft' ? `/admin/tournament/${t.id}/edit` : `/admin/tournament/${t.id}/play`)}
                      className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-zinc-300 transition-colors flex items-center justify-center"
                      title="Entrar"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    
                    <button
                      onClick={() => handleDelete(t.id)}
                      disabled={deletingId === t.id}
                      className="p-2.5 rounded-xl bg-zinc-900 hover:bg-red-950/30 text-zinc-650 hover:text-red-500 transition-colors flex items-center justify-center disabled:opacity-50"
                      title="Eliminar"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* CREATE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <form
            onSubmit={handleCreate}
            className="bg-zinc-950 border border-zinc-900 p-6 rounded-3xl max-w-xs w-full text-center relative overflow-hidden"
          >
            {/* Accent Line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-brand to-purple-brand" />
            
            <h3 className="text-lg font-black text-white mb-1">Nuevo Torneo</h3>
            <p className="text-sm text-gray-500 mb-4">Ingresa el nombre de la competición</p>
            
            <input
              type="text"
              value={newTournamentName}
              onChange={(e) => setNewTournamentName(e.target.value)}
              placeholder="Ej. Torneo Relámpago 2026"
              required
              className="w-full px-3 py-2.5 bg-zinc-900 border border-zinc-850 rounded-xl text-base text-white focus:outline-none focus:border-orange-brand mb-6"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setNewTournamentName('');
                }}
                className="flex-1 py-2.5 rounded-xl bg-zinc-900 border border-zinc-850 text-base font-bold text-gray-400"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isCreating || !newTournamentName.trim()}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-brand to-purple-brand text-white font-bold text-base flex items-center justify-center gap-1 disabled:opacity-50"
              >
                {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Crear'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}
