import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Play, Settings } from 'lucide-react';
import type { MatchConfig, MatchModality } from '../types/sport';
import { useMatchStore } from '../store/matchStore';

export default function MatchSetup() {
  const navigate = useNavigate();
  const { initMatch } = useMatchStore();
  const [team1Name, setTeam1Name] = useState('Local');
  const [team2Name, setTeam2Name] = useState('Visitante');
  const [setsToWin, setSetsToWin] = useState<number>(2); // Best of 3
  const [regularPoints, setRegularPoints] = useState<number>(9);
  const [tiebreakPoints, setTiebreakPoints] = useState<number>(5); // default to 5 points
  const [modality, setModality] = useState<MatchModality>('6v6');
  const [overtimeMode, setOvertimeMode] = useState<'con_alargue' | 'a_muerte'>('con_alargue');

  const handleStart = (e: FormEvent) => {
    e.preventDefault();
    
    const localTeam1 = { id: 'team1', name: team1Name || 'Local' };
    const localTeam2 = { id: 'team2', name: team2Name || 'Visitante' };
    const matchConfig = {
      setsToWin,
      regularPoints,
      tiebreakPoints,
      modality,
      overtimeMode
    } as MatchConfig;

    // Reset and initialize Zustand match store
    initMatch(localTeam1, localTeam2, matchConfig);
    
    // Save configuration to localStorage for quick retrieval by the Scoreboard on refresh
    const setupData = {
      team1: localTeam1,
      team2: localTeam2,
      config: matchConfig
    };
    
    localStorage.setItem('volley_local_match_setup', JSON.stringify(setupData));
    navigate('/match/scoreboard');
  };

  return (
    <div className="flex flex-col min-h-[90vh] p-4 text-white select-none">
      {/* Top Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-300" />
        </button>
        <div>
          <h2 className="text-[22px] font-extrabold">Configuración</h2>
          <p className="text-sm text-gray-400">Nuevo Partido Simple (Sin login)</p>
        </div>
      </div>

      {/* Setup Form */}
      <form onSubmit={handleStart} className="flex flex-col flex-grow gap-5 max-w-sm mx-auto w-full">
        {/* Team Names */}
        <div className="flex flex-col gap-3 p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl">
          <h3 className="text-base font-bold text-gray-300 flex items-center gap-2">
            <Settings className="w-4 h-4 text-orange-brand" />
            Nombres de los Equipos
          </h3>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-350 font-semibold">Equipo Local (Naranja)</label>
            <input
              type="text"
              value={team1Name}
              onChange={(e) => setTeam1Name(e.target.value)}
              placeholder="Local"
              className="px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-base focus:outline-none focus:border-orange-brand"
            />
          </div>
          <div className="flex flex-col gap-2 mt-1">
            <label className="text-sm text-gray-350 font-semibold">Equipo Visitante (Morado)</label>
            <input
              type="text"
              value={team2Name}
              onChange={(e) => setTeam2Name(e.target.value)}
              placeholder="Visitante"
              className="px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-base focus:outline-none focus:border-purple-brand"
            />
          </div>
        </div>

        {/* Match Rules */}
        <div className="flex flex-col gap-4 p-4 bg-zinc-900/60 border border-zinc-850 rounded-2xl">
          <h3 className="text-base font-bold text-gray-300">Reglamento del Partido</h3>

          {/* Sets to win */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-350 font-semibold">Sets para ganar</label>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => setSetsToWin(1)}
                className={`py-2 px-1 text-sm font-semibold rounded-xl border transition-all ${
                  setsToWin === 1
                    ? 'bg-zinc-800 border-orange-brand text-orange-brand'
                    : 'bg-zinc-950 border-zinc-850 text-gray-400 hover:border-zinc-800'
                }`}
              >
                1 Set (Único)
              </button>
              <button
                type="button"
                onClick={() => setSetsToWin(2)}
                className={`py-2 px-1 text-sm font-semibold rounded-xl border transition-all ${
                  setsToWin === 2
                    ? 'bg-zinc-800 border-orange-brand text-orange-brand'
                    : 'bg-zinc-950 border-zinc-850 text-gray-400 hover:border-zinc-800'
                }`}
              >
                2 Sets (de 3)
              </button>
              <button
                type="button"
                onClick={() => setSetsToWin(3)}
                className={`py-2 px-1 text-sm font-semibold rounded-xl border transition-all ${
                  setsToWin === 3
                    ? 'bg-zinc-800 border-orange-brand text-orange-brand'
                    : 'bg-zinc-950 border-zinc-850 text-gray-400 hover:border-zinc-800'
                }`}
              >
                3 Sets (de 5)
              </button>
            </div>
          </div>

          {/* Points config */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-gray-350 font-semibold">Puntos set regular</label>
              <select
                value={regularPoints}
                onChange={(e) => setRegularPoints(Number(e.target.value))}
                className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-base focus:outline-none focus:border-orange-brand"
              >
                <option value={9}>9 puntos</option>
                <option value={11}>11 puntos</option>
                <option value={15}>15 puntos</option>
                <option value={21}>21 puntos</option>
                <option value={25}>25 puntos</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm text-gray-350 font-semibold">Puntos set desempate</label>
              <select
                value={tiebreakPoints}
                onChange={(e) => setTiebreakPoints(Number(e.target.value))}
                className="px-3 py-2 bg-zinc-950 border border-zinc-800 rounded-xl text-base focus:outline-none focus:border-purple-brand"
              >
                <option value={3}>3 puntos</option>
                <option value={5}>5 puntos</option>
                <option value={9}>9 puntos</option>
                <option value={11}>11 puntos</option>
              </select>
            </div>
          </div>

          {/* Overtime (Alargue vs A Muerte) */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-350 font-semibold">Condición de Fin de Set</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setOvertimeMode('con_alargue')}
                className={`py-2 px-3 text-sm font-semibold rounded-xl border transition-all ${
                  overtimeMode === 'con_alargue'
                    ? 'bg-zinc-850 border-orange-brand text-orange-brand'
                    : 'bg-zinc-950 border-zinc-850 text-gray-400 hover:border-zinc-800'
                }`}
              >
                Con alargue (Dif. 2)
              </button>
              <button
                type="button"
                onClick={() => setOvertimeMode('a_muerte')}
                className={`py-2 px-3 text-sm font-semibold rounded-xl border transition-all ${
                  overtimeMode === 'a_muerte'
                    ? 'bg-zinc-850 border-orange-brand text-orange-brand'
                    : 'bg-zinc-950 border-zinc-850 text-gray-400 hover:border-zinc-800'
                }`}
              >
                A muerte (Punto de oro)
              </button>
            </div>
          </div>

          {/* Modality */}
          <div className="flex flex-col gap-2">
            <label className="text-sm text-gray-350 font-semibold">Modalidad</label>
            <div className="grid grid-cols-5 gap-1.5">
              {(['2v2', '3v3', '4v4', '5v5', '6v6'] as MatchModality[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setModality(mode)}
                  className={`py-2 text-base font-bold rounded-lg border transition-all ${
                    modality === mode
                      ? 'bg-zinc-800 border-purple-brand text-purple-brand'
                      : 'bg-zinc-950 border-zinc-850 text-gray-550 hover:border-zinc-850'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="flex items-center justify-center gap-2 w-full py-4 mt-auto bg-gradient-to-r from-orange-brand to-purple-brand text-white font-bold rounded-2xl hover:opacity-90 transition-all active:scale-[0.98] text-base"
        >
          <Play className="w-5 h-5 fill-current" />
          Iniciar Partido
        </button>
      </form>
    </div>
  );
}
