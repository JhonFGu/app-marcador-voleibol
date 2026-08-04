import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Edit3, Plus, Trash2, Loader2, Play, Trophy, Clock, MapPin } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { computeMatchResult, validateSetScore, type SetScoreInput } from '../utils/matchResult';

interface MatchData {
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

interface MatchDetailModalProps {
  match: MatchData;
  tournamentId: string;
  tournamentName: string;
  setsToWin: number;
  regularPoints: number;
  tiebreakPoints: number;
  overtimeMode: 'con_alargue' | 'a_muerte';
  canEdit: boolean;
  currentUserEmail: string;
  onClose: () => void;
  onSaved: () => void;
  isAdminView: boolean;
}

type EditingSet = { team1Points: string; team2Points: string };

export default function MatchDetailModal({
  match,
  tournamentId,
  tournamentName,
  setsToWin,
  regularPoints,
  tiebreakPoints,
  overtimeMode,
  canEdit,
  currentUserEmail,
  onClose,
  onSaved,
  isAdminView,
}: MatchDetailModalProps) {
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editedSets, setEditedSets] = useState<EditingSet[]>([]);

  const score = match.score_json || {};
  const sets: SetScoreInput[] = score.sets || [];
  const setsWon = score.sets_won || { team1: 0, team2: 0 };
  const winnerId = score.winner_id;
  const durationSeconds = score.duration_seconds || 0;
  const team1Name = match.team1?.name || 'Local';
  const team2Name = match.team2?.name || 'Visitante';

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const enterEditMode = () => {
    const initSets: EditingSet[] = sets.length > 0
      ? sets.map(s => ({
          team1Points: String(s.team1Points),
          team2Points: String(s.team2Points),
        }))
      : [{ team1Points: String(regularPoints), team2Points: '0' }];
    setEditedSets(initSets);
    setIsEditing(true);
  };

  const addSetRow = () => {
    const maxSets = setsToWin * 2 - 1;
    if (editedSets.length >= maxSets) return;
    setEditedSets([...editedSets, { team1Points: String(regularPoints), team2Points: '0' }]);
  };

  const removeSetRow = (index: number) => {
    if (editedSets.length <= 1) return;
    setEditedSets(editedSets.filter((_, i) => i !== index));
  };

  const updateSetRow = (index: number, field: 'team1Points' | 'team2Points', value: string) => {
    const onlyDigits = value.replace(/[^0-9]/g, '');
    setEditedSets(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: onlyDigits };
      return next;
    });
  };

  const handleSaveCorrection = async () => {
    const parsedSets: SetScoreInput[] = editedSets.map(s => ({
      team1Points: parseInt(s.team1Points) || 0,
      team2Points: parseInt(s.team2Points) || 0,
    }));

    for (let i = 0; i < parsedSets.length; i++) {
      const isTieBreak = setsToWin > 1 && i === setsToWin * 2 - 2;
      const err = validateSetScore(parsedSets[i], isTieBreak, regularPoints, tiebreakPoints, overtimeMode);
      if (err) {
        alert(`Set ${i + 1}: ${err}`);
        return;
      }
    }

    const result = computeMatchResult(parsedSets, match.team1_id, match.team2_id, setsToWin);
    if (!result.isComplete) {
      alert('Los sets ingresados no definen un ganador. Asegúrate de que un equipo alcance los sets necesarios.');
      return;
    }

    if (!confirm('¿Confirmas la corrección del resultado? Quedará registrada en la auditoría del partido.')) return;

    setIsSaving(true);
    try {
      const currentScoreJson = match.score_json || {};
      const previousSets = currentScoreJson.sets || [];
      const previousWinnerId = currentScoreJson.winner_id || null;

      const correctionEntry = {
        by: currentUserEmail,
        at: new Date().toISOString(),
        prev_sets: previousSets,
        prev_winner_id: previousWinnerId,
        new_sets: parsedSets,
        new_winner_id: result.winnerId,
      };

      const existingCorrections = currentScoreJson.corrections || [];

      const newScoreJson = {
        ...currentScoreJson,
        sets: parsedSets,
        current_set: { team1: 0, team2: 0 },
        sets_won: { team1: result.setsWon1, team2: result.setsWon2 },
        winner_id: result.winnerId,
        corrections: [...existingCorrections, correctionEntry],
      };

      const { error } = await supabase
        .from('matches')
        .update({ score_json: newScoreJson })
        .eq('id', match.id);

      if (error) throw error;

      setIsEditing(false);
      onSaved();
    } catch (e) {
      console.error('Error saving correction:', e);
      alert('No se pudo guardar la corrección. Inténtalo de nuevo.');
    } finally {
      setIsSaving(false);
    }
  };

  const editPreview = (() => {
    const parsed = editedSets.map(s => ({
      team1Points: parseInt(s.team1Points) || 0,
      team2Points: parseInt(s.team2Points) || 0,
    }));
    return computeMatchResult(parsed, match.team1_id, match.team2_id, setsToWin);
  })();

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-zinc-950 border border-zinc-900 rounded-3xl max-w-sm w-full max-h-[90vh] overflow-y-auto relative">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-orange-brand to-purple-brand" />

        <div className="flex items-center justify-between p-4 border-b border-zinc-900">
          <div>
            <span className="text-xs font-black uppercase tracking-wider text-zinc-500">{tournamentName}</span>
            <h3 className="text-lg font-extrabold text-zinc-100 mt-0.5">
              Ronda {match.round} {match.group_name ? `• ${match.group_name}` : ''}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors"
          >
            <X className="w-4 h-4 text-zinc-400" />
          </button>
        </div>

        {isEditing ? (
          <div className="p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-black text-orange-brand uppercase tracking-wider">
                Corrigiendo Resultado
              </h4>
              <button
                onClick={() => setIsEditing(false)}
                className="px-3 py-1.5 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-bold text-zinc-400 hover:text-white"
              >
                Cancelar
              </button>
            </div>

            <div className="flex flex-col gap-2">
              {editedSets.map((set, idx) => {
                const isTieBreak = setsToWin > 1 && idx === setsToWin * 2 - 2;
                return (
                  <div key={idx} className="p-3 bg-zinc-900/60 border border-zinc-850 rounded-xl flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-zinc-400 uppercase tracking-wider">
                        Set {idx + 1} {isTieBreak ? '(Desempate)' : ''}
                      </span>
                      {editedSets.length > 1 && (
                        <button
                          onClick={() => removeSetRow(idx)}
                          className="p-1 rounded-lg text-zinc-650 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <span className="text-2xs text-orange-brand font-bold uppercase">{team1Name}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={set.team1Points}
                          onChange={(e) => updateSetRow(idx, 'team1Points', e.target.value)}
                          className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-center text-lg font-black text-white focus:outline-none focus:border-orange-brand"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <span className="text-2xs text-purple-brand font-bold uppercase">{team2Name}</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          value={set.team2Points}
                          onChange={(e) => updateSetRow(idx, 'team2Points', e.target.value)}
                          className="w-full px-3 py-2.5 bg-zinc-950 border border-zinc-800 rounded-xl text-center text-lg font-black text-white focus:outline-none focus:border-purple-brand"
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              onClick={addSetRow}
              disabled={editedSets.length >= setsToWin * 2 - 1}
              className="w-full py-2.5 bg-zinc-900 border border-zinc-800 border-dashed rounded-xl text-xs font-bold text-zinc-500 hover:text-zinc-300 disabled:opacity-30 flex items-center justify-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar Set
            </button>

            <div className="p-3 bg-zinc-900/40 border border-zinc-850 rounded-xl flex items-center justify-between">
              <span className="text-xs font-bold text-zinc-400">Resultado preliminar</span>
              <span className="text-sm font-black text-zinc-200">
                {team1Name} {editPreview.setsWon1} - {editPreview.setsWon2} {team2Name}
                {editPreview.winnerId && (
                  <span className={`ml-2 text-xs font-extrabold ${
                    editPreview.winnerId === match.team1_id ? 'text-orange-brand' : 'text-purple-brand'
                  }`}>
                    → Ganador: {editPreview.winnerId === match.team1_id ? team1Name : team2Name}
                  </span>
                )}
              </span>
            </div>

            <button
              onClick={handleSaveCorrection}
              disabled={isSaving}
              className="w-full py-3 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-extrabold rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
              Guardar Corrección
            </button>
          </div>
        ) : (
          <div className="p-4 flex flex-col gap-5">
            <div className="flex items-center justify-center gap-4">
              <div className="flex-1 text-right">
                <span className={`text-lg font-black ${winnerId === match.team1_id ? 'text-orange-brand' : 'text-zinc-200'}`}>
                  {team1Name}
                </span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-900 rounded-xl border border-zinc-850">
                <span className="text-2xl font-black font-mono text-zinc-100">{setsWon.team1}</span>
                <span className="text-sm font-bold text-zinc-500">-</span>
                <span className="text-2xl font-black font-mono text-zinc-100">{setsWon.team2}</span>
              </div>
              <div className="flex-1 text-left">
                <span className={`text-lg font-black ${winnerId === match.team2_id ? 'text-purple-brand' : 'text-zinc-200'}`}>
                  {team2Name}
                </span>
              </div>
            </div>

            {winnerId && (
              <div className={`py-2 px-4 rounded-xl text-center border text-sm font-extrabold uppercase ${
                winnerId === match.team1_id
                  ? 'bg-orange-brand/10 border-orange-brand/30 text-orange-brand'
                  : 'bg-purple-brand/10 border-purple-brand/30 text-purple-brand'
              }`}>
                <Trophy className="w-4 h-4 inline mr-1.5" />
                Ganador: {winnerId === match.team1_id ? team1Name : team2Name}
              </div>
            )}

            {sets.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h4 className="text-xs font-black uppercase tracking-wider text-zinc-500 border-b border-zinc-900 pb-2">
                  Puntos por Set
                </h4>
                {sets.map((set, idx) => {
                  const isTieBreak = setsToWin > 1 && idx === setsToWin * 2 - 2;
                  const t1Won = Number(set.team1Points) > Number(set.team2Points);
                  const t2Won = Number(set.team2Points) > Number(set.team1Points);
                  return (
                    <div key={idx} className="flex items-center justify-between py-2 px-3 bg-zinc-900/40 rounded-xl border border-zinc-850/50">
                      <div className="flex items-center gap-3 flex-1 justify-end">
                        {t1Won && <span className="text-xs">🏆</span>}
                        <span className={`text-base font-bold font-mono ${t1Won ? 'text-orange-brand' : 'text-zinc-350'}`}>
                          {set.team1Points}
                        </span>
                      </div>
                      <span className="text-xs font-extrabold text-zinc-500 uppercase px-3">
                        Set {idx + 1}{isTieBreak ? ' (Des.)' : ''}
                      </span>
                      <div className="flex items-center gap-3 flex-1 justify-start">
                        <span className={`text-base font-bold font-mono ${t2Won ? 'text-purple-brand' : 'text-zinc-350'}`}>
                          {set.team2Points}
                        </span>
                        {t2Won && <span className="text-xs">🏆</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {sets.length === 0 && (
              <div className="p-6 border border-zinc-900 border-dashed rounded-2xl text-center">
                <p className="text-xs text-zinc-550">
                  {match.status === 'pending'
                    ? 'Partido pendiente de inicio.'
                    : 'Sin datos de sets registrados.'}
                </p>
              </div>
            )}

            <div className="flex flex-col gap-1.5 p-3 bg-zinc-900/40 border border-zinc-850 rounded-xl">
              <div className="flex items-center gap-2 text-xs text-zinc-450">
                <Clock className="w-3.5 h-3.5" />
                <span className="font-bold">Duración:</span>
                <span className="font-mono">{formatTime(durationSeconds)}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-zinc-450">
                <MapPin className="w-3.5 h-3.5" />
                <span className="font-bold">Cancha:</span>
                <span className="font-mono">{match.court}</span>
              </div>
              {match.scheduled_time && (
                <div className="text-xs text-zinc-500">
                  Programado: {new Date(match.scheduled_time).toLocaleDateString('es-ES', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })}
                </div>
              )}
            </div>

            {isAdminView && match.status === 'in_progress' && (
              <button
                onClick={() => navigate(`/admin/match/referee/${match.id}`)}
                className="w-full py-2.5 bg-zinc-900 border border-zinc-800 hover:border-orange-brand/50 text-white font-extrabold rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-current text-orange-brand" />
                Continuar Arbitraje
              </button>
            )}

            {match.status === 'in_progress' && (
              <button
                onClick={() => navigate(`/tournament/${tournamentId}/live/${match.id}`)}
                className="w-full py-2.5 bg-gradient-to-r from-orange-brand/20 to-purple-brand/20 border border-zinc-800 text-zinc-200 font-bold rounded-xl text-sm flex items-center justify-center gap-2"
              >
                <Play className="w-3.5 h-3.5 fill-current text-orange-brand" />
                Ver Marcador en Vivo
              </button>
            )}

            {canEdit && (
              <button
                onClick={enterEditMode}
                className="w-full py-3 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-extrabold rounded-xl text-sm uppercase tracking-wider flex items-center justify-center gap-2"
              >
                <Edit3 className="w-4 h-4" />
                Corregir Resultado
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
