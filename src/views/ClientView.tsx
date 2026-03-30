import { motion } from 'motion/react';
import {
  AlertCircle,
  CheckCircle,
  CheckCircle2,
  Mic,
} from 'lucide-react';
import { cn } from '../lib/utils';
import { StatusBadge } from '../components/StatusBadge';
import type { Job } from '../types';

type ClientViewProps = {
  isLoading: boolean;
  error: string | null;
  job: Job | null;
  justApproved: boolean;
  isSupabaseConnected: boolean;
  workshopName: string;
  onApproveBudget: () => void;
};

export function ClientView({
  isLoading,
  error,
  job,
  justApproved,
  isSupabaseConnected,
  workshopName,
  onApproveBudget,
}: ClientViewProps) {
  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Cargando tu informe...</p>
        </div>
      </div>
    );
  }

  if (error || !job) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="bg-white p-8 rounded-[40px] shadow-xl border border-slate-100 text-center max-w-sm">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-black text-slate-900 mb-2 uppercase">¡Vaya! Algo ha fallado</h2>
          <p className="text-slate-500 font-medium mb-8">{error || "No hemos podido cargar la información de tu vehículo."}</p>
          <button
            onClick={() => window.location.href = window.location.origin}
            className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest"
          >
            Ir a la web principal
          </button>

        </div>
      </div>
    );
  }

  if (justApproved) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white p-8 rounded-[40px] shadow-xl border border-slate-100 text-center max-w-sm"
        >
          <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckCircle size={40} />
          </div>
          <h2 className="text-2xl font-black text-slate-900 mb-2 uppercase italic tracking-tight">¡Presupuesto Aprobado!</h2>
          <p className="text-slate-500 font-medium mb-8">Gracias por su confianza. Hemos recibido su aprobación y nuestro equipo ya se ha puesto manos a la obra con su vehículo.</p>

          {!isSupabaseConnected && (
            <div className="bg-amber-50 p-4 rounded-2xl mb-6 border border-amber-100">
              <p className="text-amber-700 text-[10px] font-bold uppercase tracking-tight">
                ⚠️ Nota: La aprobación se ha guardado localmente pero no se ha podido sincronizar con el taller por falta de conexión.
              </p>
            </div>
          )}

          <p className="text-slate-500 text-sm leading-relaxed">
            Le avisaremos por WhatsApp cuando el coche esté listo.<br />
            Para cualquier aclaración adicional, puede ponerse en contacto con nosotros.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-12 overflow-y-auto">
      <header className="bg-[#050A1F] text-white p-6 rounded-b-[40px] shadow-xl text-center">
        <h1 className="text-xl font-black tracking-tighter uppercase italic text-blue-400 mb-2">TallerLive</h1>
        <h2 className="text-lg font-black uppercase tracking-widest">Informe de Diagnóstico</h2>
        <p className="text-blue-400 text-xs font-bold mt-1">{workshopName}</p>
      </header>

      <main className="p-5 space-y-6 -mt-6 pb-20">
        {/* Datos del vehículo */}
        <div className="bg-white rounded-[32px] p-6 shadow-xl border border-slate-100">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Vehículo</span>
              <h3 className="text-2xl font-black text-slate-900">{job.plate}</h3>
              <p className="text-slate-500 font-bold text-base">{job.model}</p>
            </div>
            <StatusBadge status={job.status} />
          </div>
        </div>

        {/* Bloque impacto */}
        {job.urgency && (
          <div className="rounded-2xl border px-4 py-3 bg-[#1a1f2e] border-white/10">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
              Nivel de urgencia
            </p>
            <p className={cn(
              "text-sm font-bold",
              job.urgency === 'high' && "text-red-400",
              job.urgency === 'medium' && "text-amber-400",
              job.urgency === 'low' && "text-green-400"
            )}>
              {job.urgency === 'high' && "⚠️ Requiere atención inmediata"}
              {job.urgency === 'medium' && "⚠️ Recomendado reparar en breve"}
              {job.urgency === 'low' && "ℹ️ Revisar cuando sea posible"}
            </p>
          </div>
        )}

        {/* Presupuesto */}
        <div className="bg-white rounded-[32px] p-6 shadow-xl border border-slate-100">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Presupuesto Estimado</span>
            {(job.quote_version ?? 1) > 1 && (
              <span className="text-[10px] font-black text-amber-500 uppercase tracking-widest bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                Revisión {job.quote_version}
              </span>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span className="text-4xl font-black text-blue-600">{job.budget || '0'}€</span>
            {job.photos?.length > 0 && (
              <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-white shadow-md shrink-0">
                <img src={job.photos[0]} alt="Evidencia" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
        </div>

        {/* Diagnóstico reestructurado */}
        {(() => {
          if (!job.aiDiagnosis) return null;
          const paragraphs = job.aiDiagnosis
            .split('\n')
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0);
          if (paragraphs.length <= 1) {
            return (
              <div className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-4">
                <p className="text-sm text-slate-200 font-medium leading-relaxed">
                  {job.aiDiagnosis}
                </p>
              </div>
            );
          }
          const labels = ['Qué ocurre', 'Por qué', 'Riesgo'];
          return (
            <div className="space-y-3">
              {paragraphs.slice(0, 3).map((p: string, i: number) => (
                <div key={i} className="bg-[#1a1f2e] border border-white/10 rounded-2xl p-4">
                  <p className="text-[10px] font-black uppercase tracking-widest text-blue-400 mb-1">
                    {labels[i]}
                  </p>
                  <p className="text-sm text-slate-200 font-medium leading-relaxed">
                    {p}
                  </p>
                </div>
              ))}
            </div>
          );
        })()}

        {/* Evidencias del Taller */}
        {(job.photos?.length > 0 || job.audios?.length > 0) && (
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Evidencia real del problema</h3>

            {job.photos?.length > 0 && (
              <div className="space-y-3">
                {job.photos.map((photo: string, i: number) => (
                  <div key={i} className="rounded-2xl overflow-hidden border-2 border-white shadow-lg bg-slate-900" style={{ maxWidth: '100%' }}>
                    <img
                      src={photo}
                      alt={`Evidencia ${i + 1}`}
                      className="w-full object-contain rounded-2xl"
                      style={{ maxHeight: '500px' }}
                    />
                  </div>
                ))}
              </div>
            )}

            {job.audios?.length > 0 && (
              <div className="space-y-3">
                {job.audios.map((audio: string, i: number) => (
                  <div key={i} className="bg-white p-4 rounded-2xl shadow-md border border-slate-100">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 shrink-0">
                        <Mic size={20} />
                      </div>
                      <span className="text-xs font-black text-slate-500 uppercase tracking-widest">Diagnóstico Audio {i + 1}</span>
                    </div>
                    <audio controls src={audio} className="w-full h-10" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="pt-4">
          {(() => {
            const qv = job.quote_version ?? 1;
            const aqv = job.approved_quote_version ?? null;
            const currentVersionApproved = aqv !== null && aqv >= qv;

            if (currentVersionApproved) {
              // Presupuesto ya aprobado: mostrar aviso informativo, no botón
              return (
                <div className="space-y-3">
                  <div className="w-full py-4 bg-emerald-50 text-emerald-700 rounded-3xl font-black uppercase text-sm flex items-center justify-center gap-3 border-2 border-emerald-200">
                    <CheckCircle2 size={20} />
                    Presupuesto aprobado
                  </div>
                  <p className="text-center text-xs text-slate-400 font-medium">
                    Este enlace queda disponible como justificante de su aprobación.
                  </p>
                </div>
              );
            }

            if (job.status === 'waiting_customer') {
              // Nueva versión pendiente de aprobación
              return (
                <>
                  <p className="text-center text-sm text-slate-400 font-semibold mb-4">
                    Puedes aprobar ahora y nos ponemos con ello
                  </p>
                  <button
                    onClick={onApproveBudget}
                    className="w-full py-5 bg-emerald-500 text-white rounded-3xl font-black uppercase text-sm shadow-xl shadow-emerald-200 flex items-center justify-center gap-3 active:scale-95 transition-all"
                  >
                    <CheckCircle2 size={20} />
                    Aprobar Presupuesto
                  </button>
                </>
              );
            }

            if (job.status === 'delivered') {
              return (
                <p className="text-center text-sm font-bold text-slate-400">
                  Vehículo entregado. Gracias por confiar en nosotros.
                </p>
              );
            }

            return null;
          })()}
          <button
            onClick={() => window.location.href = window.location.origin}
            className="w-full py-5 mt-3 text-slate-400 font-black uppercase text-xs hover:text-slate-600 transition-colors"
          >
            ¿Tienes dudas? Habla con nosotros
          </button>
        </div>

        {/* Ayuda y Soporte */}
        <section className="mt-12 pt-8 border-t border-slate-200">
          <div className="bg-slate-100 rounded-3xl p-6">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <AlertCircle size={14} /> ¿Problemas con el informe?
            </p>
            <ul className="text-[11px] text-slate-500 space-y-3 font-medium">
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span>Si el informe no carga correctamente, intente recargar la página.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-blue-600 font-bold">•</span>
                <span>Si necesita más información, contacte directamente con {workshopName}.</span>
              </li>
            </ul>
          </div>
        </section>
      </main>
    </div>
  );
}
