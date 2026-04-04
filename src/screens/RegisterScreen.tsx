import { useState } from 'react';
import { supabase } from '../lib/supabase';

type RegisterScreenProps = {
  onShowLogin: () => void;
};

type Step = 'form' | 'rpc_error';

export function RegisterScreen({ onShowLogin }: RegisterScreenProps) {
  const [workshopName, setWorkshopName] = useState('');
  const [city, setCity] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Paso 1: crear usuario en Auth
    const { data: authData, error: authError } = await supabase.auth.signUp({ email, password });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const userId = authData.user?.id;
    if (!userId) {
      setError('No se pudo obtener el identificador del usuario. Inténtalo de nuevo.');
      setLoading(false);
      return;
    }

    // Paso 2: crear taller y perfil de forma atómica
    const { error: rpcError } = await supabase.rpc('create_workshop_and_owner', {
      p_user_id: userId,
      p_workshop_name: workshopName,
      p_city: city,
    });

    if (rpcError) {
      // Usuario creado en Auth pero falla la RPC — guardamos userId para reintento
      setPendingUserId(userId);
      setStep('rpc_error');
      setLoading(false);
      return;
    }

    setLoading(false);
    // Auth listener en App.tsx detecta la sesión y redirige automáticamente
  };

  const handleRetryRpc = async () => {
    if (!pendingUserId) return;
    setError('');
    setLoading(true);

    const { error: rpcError } = await supabase.rpc('create_workshop_and_owner', {
      p_user_id: pendingUserId,
      p_workshop_name: workshopName,
      p_city: city,
    });

    if (rpcError) {
      setError('Sigue fallando la configuración del taller. Contacta con soporte indicando tu email.');
      setLoading(false);
      return;
    }

    setLoading(false);
    // Auth listener detecta sesión activa y redirige
  };

  if (step === 'rpc_error') {
    return (
      <div className="min-h-screen bg-[#050A1F] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-[32px] p-8 text-center space-y-6">
          <h2 className="text-lg font-black text-white uppercase tracking-tight">Casi listo</h2>
          <p className="text-slate-400 text-sm font-medium leading-relaxed">
            Tu cuenta fue creada, pero no pudimos configurar el taller correctamente.
            Pulsa el botón para reintentar sin volver a empezar.
          </p>
          {error && <p className="text-red-400 text-xs font-bold">{error}</p>}
          <button
            onClick={handleRetryRpc}
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-sm tracking-widest transition-all disabled:opacity-50"
          >
            {loading ? 'Configurando...' : 'Reintentar configuración'}
          </button>
          <button
            onClick={onShowLogin}
            className="w-full py-3 text-slate-500 font-bold text-xs uppercase tracking-widest hover:text-slate-300 transition-colors"
          >
            Ya tengo cuenta — entrar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050A1F] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black tracking-tighter uppercase italic text-blue-400">TallerLive</h1>
          <p className="text-slate-400 text-sm font-bold mt-1">Registra tu taller</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <input
            type="text"
            required
            placeholder="Nombre del taller"
            value={workshopName}
            onChange={(e) => setWorkshopName(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 px-5 text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-slate-500"
          />
          <input
            type="text"
            required
            placeholder="Ciudad"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 px-5 text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-slate-500"
          />
          <input
            type="email"
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 px-5 text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-slate-500"
          />
          <input
            type="password"
            required
            minLength={6}
            placeholder="Contraseña (mín. 6 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 px-5 text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-slate-500"
          />
          {error && <p className="text-red-400 text-sm font-bold text-center">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-sm tracking-widest transition-all disabled:opacity-50"
          >
            {loading ? 'Creando taller...' : 'Crear mi taller'}
          </button>
        </form>
        <button
          onClick={onShowLogin}
          className="w-full mt-4 py-3 text-slate-500 font-bold text-xs uppercase tracking-widest hover:text-slate-300 transition-colors"
        >
          Ya tengo cuenta — entrar
        </button>
      </div>
    </div>
  );
}
