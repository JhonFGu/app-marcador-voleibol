import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Calendar, Loader2, ArrowRight } from 'lucide-react';
import { supabase } from '../supabaseClient';

interface Tournament {
  id: string;
  name: string;
  status: 'draft' | 'active' | 'finished';
  config_json: any;
  created_at: string;
}

export default function TournamentsList() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('tournaments')
        .select('*')
        .neq('status', 'draft') // Only active and finished are public
        .order('created_at', { ascending: false });

      if (error) throw error;
      setTournaments(data || []);
    } catch (e) {
      console.error('Error fetching public tournaments:', e);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: Tournament['status']) => {
    if (status === 'active') {
      return (
        <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 uppercase tracking-wide">
          En Vivo 🔴
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 text-[9px] font-bold rounded bg-blue-500/10 text-blue-500 border border-blue-500/20 uppercase tracking-wide">
        Finalizado
      </span>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans select-none relative pb-10">
      
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 py-3 border-b border-zinc-900 bg-zinc-950/40 px-3 rounded-2xl">
        <button
          onClick={() => navigate('/')}
          className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-300" />
        </button>
        <div>
          <h2 className="text-xl font-bold tracking-tight">Torneos Activos</h2>
          <p className="text-xs text-gray-400">PuntosVolley online</p>
        </div>
      </div>

      {/* Main Container */}
      <div className="flex-grow flex flex-col gap-6 max-w-md mx-auto w-full">
        {loading ? (
          <div className="text-center py-20 text-zinc-500 text-xs flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-6 h-6 animate-spin text-orange-brand" />
            Cargando torneos de la nube...
          </div>
        ) : tournaments.length === 0 ? (
          <div className="p-10 border border-zinc-900 border-dashed rounded-3xl text-center flex flex-col items-center justify-center bg-zinc-950/20 my-auto">
            <span className="text-4xl mb-3">🏐</span>
            <h4 className="text-sm font-bold text-zinc-400 mb-1">Sin torneos activos</h4>
            <p className="text-[10px] text-zinc-500 max-w-[200px] leading-relaxed">
              Actualmente no hay campeonatos en juego o finalizados en la plataforma.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tournaments.map((t) => (
              <div
                key={t.id}
                onClick={() => navigate(`/tournament/${t.id}`)}
                className="p-4 bg-zinc-950 border border-zinc-900 rounded-2xl hover:border-purple-brand/40 transition-all flex items-center justify-between cursor-pointer group active:scale-[0.99]"
              >
                <div className="flex flex-col gap-1 text-left max-w-[75%]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-extrabold text-sm text-zinc-150 group-hover:text-purple-brand transition-colors truncate max-w-[170px]">{t.name}</h4>
                    {getStatusBadge(t.status)}
                  </div>
                  <span className="text-[9px] text-zinc-500 font-mono flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-zinc-650" />
                    {new Date(t.created_at).toLocaleDateString('es-ES', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                  </span>
                </div>

                <div className="p-2.5 rounded-xl bg-zinc-900 hover:bg-purple-brand text-zinc-300 group-hover:text-white transition-all flex items-center justify-center">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
