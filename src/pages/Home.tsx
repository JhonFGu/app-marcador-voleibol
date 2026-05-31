import { useNavigate } from 'react-router-dom';
import { Trophy, Play, ShieldAlert } from 'lucide-react';

export default function Home() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-between min-h-[85vh] p-4 text-white select-none">
      {/* Header / Brand */}
      <div className="flex flex-col items-center mt-6 text-center">
        <h1 className="text-[22px] font-extrabold tracking-tight bg-gradient-to-r from-orange-brand to-purple-brand bg-clip-text text-transparent">
          PuntosVolley
        </h1>
        <p className="text-sm font-semibold tracking-wider text-gray-450 uppercase mt-1 mb-4 flex items-center gap-1 justify-center">
          Creado con <span className="text-red-500 animate-pulse">❤️</span> por Cuervos Volley Club
        </p>
        <div className="relative flex items-center justify-center w-36 h-36 bg-zinc-900/50 border border-zinc-800/80 rounded-3xl shadow-xl overflow-hidden p-1 bg-gradient-to-tr from-orange-brand/5 to-purple-brand/5">
          <img 
            src="/logo-club.png" 
            alt="Cuervos Volley Club Logo" 
            className="w-full h-full object-contain"
          />
        </div>
      </div>

      {/* Main Options */}
      <div className="flex flex-col w-full max-w-sm gap-6 my-auto">
        {/* Simple Match Button */}
        <button
          onClick={() => navigate('/match/setup')}
          className="flex items-center justify-between w-full p-5 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-orange-brand transition-all duration-300 active:scale-[0.98] group"
        >
          <div className="flex items-center gap-4 text-left">
            <div className="p-3 rounded-xl bg-orange-brand/10 text-orange-brand group-hover:bg-orange-brand/20 transition-colors">
              <Play className="w-6 h-6 fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Partido Simple</h3>
              <p className="text-sm text-gray-400">Marcador rápido local sin cuenta</p>
            </div>
          </div>
          <span className="text-orange-brand font-bold text-xl mr-2">→</span>
        </button>

        {/* Tournaments Button */}
        <button
          onClick={() => navigate('/tournaments')}
          className="flex items-center justify-between w-full p-5 bg-zinc-900 border border-zinc-800 rounded-2xl hover:border-purple-brand transition-all duration-300 active:scale-[0.98] group"
        >
          <div className="flex items-center gap-4 text-left">
            <div className="p-3 rounded-xl bg-purple-brand/10 text-purple-brand group-hover:bg-purple-brand/20 transition-colors">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Torneo / Club</h3>
              <p className="text-sm text-gray-400">Partidos, tablas e historial en la nube</p>
            </div>
          </div>
          <span className="text-purple-brand font-bold text-xl mr-2">→</span>
        </button>
      </div>

      {/* Admin Panel Link */}
      <div className="w-full max-w-sm">
        <button
          onClick={() => navigate('/admin/login')}
          className="flex items-center justify-center gap-2 w-full py-3 bg-zinc-950 border border-zinc-900 rounded-xl text-base font-semibold text-gray-400 hover:text-white hover:border-zinc-800 transition-all"
        >
          <ShieldAlert className="w-4 h-4" />
          Acceso Administrador / Árbitro
        </button>
        <p className="text-xs text-center text-zinc-600 mt-4">
          v1.0.0 • © 2026 Cuervos Volley Club. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
