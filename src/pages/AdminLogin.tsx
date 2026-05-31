import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../supabaseClient';
import { ArrowLeft, ShieldAlert, KeyRound, Mail, Loader2 } from 'lucide-react';

export default function AdminLogin() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) {
      navigate('/admin/dashboard');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email || !password) {
      setErrorMsg('Por favor, ingresa el correo y la contraseña.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (activeTab === 'login') {
        // Sign in
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) {
          if (error.message === 'Invalid login credentials') {
            setErrorMsg('Credenciales incorrectas. Verifica tu correo y contraseña.');
          } else {
            setErrorMsg(error.message);
          }
        }
      } else {
        // Sign up
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (error) {
          setErrorMsg(error.message);
        } else if (data.user && data.session === null) {
          setSuccessMsg('¡Registro exitoso! Revisa tu correo para confirmar tu cuenta (si tienes habilitado la confirmación). Ya puedes intentar iniciar sesión.');
          setActiveTab('login');
          setPassword('');
        } else {
          setSuccessMsg('¡Usuario registrado e ingresado con éxito!');
        }
      }
    } catch (err: any) {
      setErrorMsg('Ocurrió un error inesperado. Inténtalo de nuevo.');
      console.error(err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-black text-white p-4 font-sans select-none">
      {/* Top Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/')}
          className="p-2 bg-zinc-900 border border-zinc-800 rounded-xl hover:bg-zinc-800 transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-300" />
        </button>
        <div>
          <h2 className="text-[22px] font-extrabold">Panel Admin</h2>
          <p className="text-sm text-gray-400">Acceso restringido</p>
        </div>
      </div>

      {/* Auth Form Card */}
      <div className="flex-grow flex flex-col items-center justify-center p-2">
        <div className="w-full max-w-sm p-6 bg-zinc-950 border border-zinc-900 rounded-3xl shadow-2xl relative overflow-hidden">
          {/* Accent Line */}
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-orange-brand to-purple-brand" />

          {/* Logo and Icon */}
          <div className="flex flex-col items-center mb-6 text-center">
            <div className="p-3 bg-orange-brand/10 text-orange-brand rounded-full mb-3">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-white">Ingreso Administrador</h3>
            <p className="text-sm text-gray-450 mt-1">Gestiona torneos, partidos y marcadores oficiales.</p>
          </div>

          {/* Custom Tabs */}
          <div className="grid grid-cols-2 p-1 bg-zinc-900/60 border border-zinc-850 rounded-xl mb-6">
            <button
              onClick={() => {
                setActiveTab('login');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-2 text-base font-bold rounded-lg transition-all ${
                activeTab === 'login'
                  ? 'bg-zinc-800 text-orange-brand border border-orange-brand/10'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Ingresar
            </button>
            <button
              onClick={() => {
                setActiveTab('register');
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className={`py-2 text-base font-bold rounded-lg transition-all ${
                activeTab === 'register'
                  ? 'bg-zinc-800 text-purple-brand border border-purple-brand/10'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              Registrarse
            </button>
          </div>

          {/* Notification Messages */}
          {errorMsg && (
            <div className="p-3 mb-4 rounded-xl bg-red-950/40 border border-red-900/50 text-sm text-red-400 font-semibold leading-relaxed">
              ⚠️ {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="p-3 mb-4 rounded-xl bg-emerald-950/40 border border-emerald-900/50 text-sm text-emerald-400 font-semibold leading-relaxed">
              ✅ {successMsg}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Email Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm uppercase font-bold text-gray-400 tracking-wider">Correo Electrónico</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -mt-2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ejemplo@correo.com"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/40 border border-zinc-800 rounded-xl text-base focus:outline-none focus:border-orange-brand transition-colors"
                />
              </div>
            </div>

            {/* Password Field */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm uppercase font-bold text-gray-400 tracking-wider">Contraseña</label>
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -mt-2 w-4 h-4 text-zinc-500" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="w-full pl-10 pr-4 py-2.5 bg-zinc-900/40 border border-zinc-800 rounded-xl text-base focus:outline-none focus:border-purple-brand transition-colors"
                />
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`flex items-center justify-center gap-2 w-full py-3.5 mt-2 bg-gradient-to-r from-orange-brand to-purple-brand text-white font-bold rounded-xl text-base hover:opacity-95 transition-all active:scale-[0.98] ${
                isSubmitting ? 'opacity-70 pointer-events-none' : ''
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4.5 h-4.5 animate-spin" />
                  Procesando...
                </>
              ) : activeTab === 'login' ? (
                'Iniciar Sesión'
              ) : (
                'Crear Cuenta Admin'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
