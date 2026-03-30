import React from 'react';
import {
  Camera,
  Mic,
  FileText,
  MessageSquare,
  Check,
  CheckCircle2,
} from 'lucide-react';
import { cn } from '../lib/utils';
import type { Job } from '../types';

export const WORKFLOW_STEPS = [
  { key: 'photo',  label: 'Fotos',     Icon: Camera         },
  { key: 'audio',  label: 'Grabación', Icon: Mic            },
  { key: 'budget', label: 'Informe',   Icon: FileText       },
  { key: 'shared', label: 'Envío',     Icon: MessageSquare  },
] as const;

export const getStepsDone = (job: Job): boolean[] => [
  (job.photos?.length ?? 0) > 0,
  (job.audios?.length ?? 0) > 0,
  parseFloat(job.budget ?? '0') > 0,
  job.budgetShared === true,
];

export const WorkflowTracker = ({ job, onStepClick }: { job: Job; onStepClick?: (step: number) => void }) => {
  const done = getStepsDone(job);
  const completedCount = done.filter(Boolean).length;
  const firstPending = done.findIndex(d => !d);

  return (
    <div className="space-y-2 mt-2">
      <div className="flex items-center">
        {WORKFLOW_STEPS.map(({ key, label, Icon }, i) => {
          const isDone   = done[i];
          const isActive = !isDone && i === firstPending;
          return (
            <React.Fragment key={key}>
              <div
                className="flex flex-col items-center gap-0.5 flex-1 cursor-pointer select-none"
                onClick={() => onStepClick?.(i)}
              >
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-200",
                  isDone   && "bg-[#3FA37A] border-[#3FA37A] text-white",
                  isActive && "bg-blue-700 border-blue-700 text-white ring-2 ring-blue-900",
                  !isDone && !isActive && "bg-[#1C1E28] border-slate-600 text-slate-500"
                )}>
                  {isDone ? <Check size={18} /> : <Icon size={18} />}
                </div>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-wide leading-none",
                  isDone   && "text-[#3FA37A]",
                  isActive && "text-blue-400",
                  !isDone && !isActive && "text-slate-400"
                )}>
                  {label}
                </span>
              </div>
              {i < WORKFLOW_STEPS.length - 1 && (
                <div className={cn(
                  "h-px flex-1 mb-4 mx-0.5 transition-colors duration-300",
                  done[i] ? "bg-[#3FA37A]" : "bg-slate-600/60"
                )} />
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ backgroundColor: '#3FA37A', width: `${(completedCount / 4) * 100}%` }}
          />
        </div>
        <span className="text-sm font-black text-slate-500 shrink-0 tabular-nums">
          {completedCount}/4
        </span>
      </div>
    </div>
  );
};

// Siguiente acción disponible según el estado real del job
export const getNextAction = (job: Job) => {
  if (!(job.photos?.length > 0))            return { label: 'Capturar fotos',            Icon: Camera,        variant: 'blue',  action: 'photo'  } as const;
  if (!(job.audios?.length > 0))            return { label: 'Registrar grabación',       Icon: Mic,           variant: 'blue',  action: 'audio'  } as const;
  if (!(parseFloat(job.budget ?? '0') > 0)) return { label: 'Crear informe',             Icon: FileText,      variant: 'blue',  action: 'budget' } as const;
  if (!job.budgetShared)                    return { label: 'Enviar informe presupuesto', Icon: MessageSquare, variant: 'blue',  action: 'share'  } as const;
  // Revisión pendiente = precio cambió desde el último envío (quote_version > 1 y mayor que la última aprobada)
  const hasPendingRevision = (job.quote_version ?? 1) > 1 && (job.quote_version ?? 1) > (job.approved_quote_version ?? 0);
  if (job.status === 'repairing') {
    if (hasPendingRevision) return { label: 'Enviar presupuesto revisado', Icon: MessageSquare, variant: 'blue',  action: 'share'  } as const;
    return                          { label: 'Finalizar reparación',        Icon: CheckCircle2,  variant: 'green', action: 'finish' } as const;
  }
  if (job.status === 'waiting_customer') {
    const label = hasPendingRevision ? 'Enviar presupuesto revisado' : 'Reenviar informe';
    return { label, Icon: MessageSquare, variant: 'blue' as const, action: 'share' as const };
  }
  if (job.status === 'ready') {
    // Reenvío simple — precio bloqueado, sin revisión posible
    return { label: 'Reenviar informe', Icon: MessageSquare, variant: 'blue' as const, action: 'share' as const };
  }
  return null;
};
