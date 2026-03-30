import { cn } from '../lib/utils';
import type { JobStatus } from '../types';

export const StatusBadge = ({ status }: { status: JobStatus }) => {
  const config: Record<string, { label: string; color: string }> = {
    // Estados actuales
    waiting:          { label: 'En espera',         color: 'bg-[#EDEDED] text-[#787878] border-[#D0D0D0]' },
    diagnosed:        { label: 'Diagnosticado',      color: 'bg-[#F0EBE0] text-[#7B6347] border-[#D4C4A0]' },
    waiting_customer: { label: 'En espera cliente',  color: 'bg-[#F2E8D0] text-[#7A5C2A] border-[#CDAC70]' },
    repairing:        { label: 'En preparación',     color: 'bg-[#D5E2F0] text-[#2E4870] border-[#7AAAD0]' },
    ready:            { label: 'Listo ✓',            color: 'bg-[#C8E6C4] text-[#2E5E35] border-[#7AB87A]' },
    delivered:        { label: 'Entregado',           color: 'bg-[#E0E0E0] text-[#505050] border-[#C0C0C0]' },
    // Legado (datos existentes en BD)
    awaiting_diagnosis: { label: 'En espera',        color: 'bg-[#EDEDED] text-[#787878] border-[#D0D0D0]' },
    diagnosing:         { label: 'Diagnosticado',     color: 'bg-[#F0EBE0] text-[#7B6347] border-[#D4C4A0]' },
  };

  const { label, color } = config[status] ?? { label: status ?? 'Desconocido', color: 'bg-slate-100 text-slate-500 border-slate-200' };
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border", color)}>
      {label}
    </span>
  );
};
