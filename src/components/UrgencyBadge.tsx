import { cn } from '../lib/utils';

export const UrgencyBadge = ({ urgency }: { urgency: 'low' | 'medium' | 'high' }) => {
  const config = {
    low: { label: 'Baja', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    medium: { label: 'Media', color: 'bg-blue-900/40 text-blue-400 border-blue-200' },
    high: { label: 'Alta', color: 'bg-red-100 text-red-600 border-red-200' },
  };

  const { label, color } = config[urgency] || config.medium;
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border", color)}>
      {label}
    </span>
  );
};
