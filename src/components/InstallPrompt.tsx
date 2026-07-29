import { Download, X } from 'lucide-react';

interface InstallPromptProps {
  isInstallable: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}

export default function InstallPrompt({
  isInstallable,
  onInstall,
  onDismiss,
}: InstallPromptProps) {
  if (!isInstallable) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-fade-in">
      <div className="max-w-sm mx-auto p-4 bg-gradient-to-r from-orange-brand to-purple-brand rounded-2xl shadow-2xl shadow-purple-brand/30 border border-white/10">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏐</span>
            <div>
              <p className="text-sm font-extrabold text-white">Instalar App</p>
              <p className="text-xs text-white/70">Usa PuntosVolley como app nativa</p>
            </div>
          </div>
          <button
            onClick={onDismiss}
            className="p-1 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            onClick={onInstall}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-white text-black font-bold rounded-xl text-sm active:scale-[0.97] transition-all"
          >
            <Download className="w-4 h-4" />
            Instalar
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 py-2.5 bg-white/10 text-white/80 font-semibold rounded-xl text-sm active:scale-[0.97] transition-all border border-white/10"
          >
            Ahora no
          </button>
        </div>
      </div>
    </div>
  );
}
