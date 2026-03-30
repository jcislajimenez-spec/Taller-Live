import { useState } from 'react';
import { supabase } from '../lib/supabase';

export function ResetPasswordScreen({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError('Las contraseñas no coinciden'); return; }
    if (password.length < 6) { setError('Mínimo 6 caracteres'); return; }
    setError('');
    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) { setError(updateError.message); setLoading(false); return; }
    setDone(true);
    setTimeout(onDone, 1500);
  };

  return (
    <div className="min-h-screen bg-[#050A1F] flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-black tracking-tighter uppercase italic text-blue-400">TallerLive</h1>
          <p className="text-slate-400 text-sm font-bold mt-1">Nueva contraseña</p>
        </div>
        {done ? (
          <p className="text-emerald-400 font-black text-center">Contraseña actualizada. Entrando...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="password"
              required
              placeholder="Nueva contraseña"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 px-5 text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-slate-500"
            />
            <input
              type="password"
              required
              placeholder="Confirmar contraseña"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 px-5 text-white font-bold focus:outline-none focus:ring-2 focus:ring-blue-500/50 placeholder:text-slate-500"
            />
            {error && <p className="text-red-400 text-sm font-bold text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black uppercase text-sm tracking-widest transition-all disabled:opacity-50"
            >
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
