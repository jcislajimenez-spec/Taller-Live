import { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UrgencyLevel = 'high' | 'medium' | 'low';

type UrgencyKPI = {
  urgency: UrgencyLevel;
  avgHours: number;
  n: number;
};

type MonthlyKPI = {
  month: string;       // "2026-01"
  monthLabel: string;  // "ene. 26"
  byUrgency: UrgencyKPI[];
};

type MetricsData = {
  responseKPIs: UrgencyKPI[];     // mes actual — respuesta del cliente
  cycleKPIs: UrgencyKPI[];        // mes actual — ciclo total
  responseHistory: MonthlyKPI[];  // 6 meses — respuesta del cliente
  cycleHistory: MonthlyKPI[];     // 6 meses — ciclo total
};

type MetricsScreenProps = {
  workshopId: string;
  userRole: string;
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function getMonthBounds(offsetMonths = 0) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + offsetMonths + 1, 0, 23, 59, 59, 999).toISOString();
  return { start, end };
}

function getSixMonthsBounds() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  return { start, end };
}

function toMonthKey(isoDate: string): string {
  const d = new Date(isoDate);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthKeyLabel(key: string): string {
  const [year, month] = key.split('-');
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString('es-ES', { month: 'short', year: '2-digit' });
}

function getLast6MonthKeys(): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
}

// ---------------------------------------------------------------------------
// Calculation helpers
// ---------------------------------------------------------------------------

const URGENCY_ORDER: UrgencyLevel[] = ['high', 'medium', 'low'];

function calcAvgHours(pairs: { from: string; to: string }[]): number {
  if (pairs.length === 0) return 0;
  const totalMs = pairs.reduce((acc, p) => {
    const diff = new Date(p.to).getTime() - new Date(p.from).getTime();
    return acc + (diff > 0 ? diff : 0); // ignorar diferencias negativas (datos corruptos)
  }, 0);
  return totalMs / pairs.length / 3_600_000; // → horas
}

function groupByUrgency(
  rows: any[],
  fromKey: string,
  toKey: string,
): UrgencyKPI[] {
  return URGENCY_ORDER.map(urgency => {
    const filtered = rows.filter(r => (r.urgency ?? 'medium') === urgency && r[fromKey] && r[toKey]);
    return {
      urgency,
      avgHours: calcAvgHours(filtered.map(r => ({ from: r[fromKey], to: r[toKey] }))),
      n: filtered.length,
    };
  });
}

function groupByMonth(
  rows: any[],
  bucketKey: string,
  fromKey: string,
  toKey: string,
): MonthlyKPI[] {
  return getLast6MonthKeys().map(month => {
    const monthRows = rows.filter(r => r[bucketKey] && toMonthKey(r[bucketKey]) === month);
    return {
      month,
      monthLabel: monthKeyLabel(month),
      byUrgency: groupByUrgency(monthRows, fromKey, toKey),
    };
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatDuration(hours: number): string {
  if (hours === 0) return '—';
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)} días`;
}

const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

const URGENCY_COLORS: Record<UrgencyLevel, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-emerald-400',
};

const URGENCY_BG: Record<UrgencyLevel, string> = {
  high: 'bg-red-900/20',
  medium: 'bg-yellow-900/20',
  low: 'bg-emerald-900/20',
};

// Colores hex para Recharts (no puede leer clases Tailwind)
const CHART_COLORS: Record<UrgencyLevel, string> = {
  high:   '#f87171', // red-400
  medium: '#facc15', // yellow-400
  low:    '#34d399', // emerald-400
};

// Transforma MonthlyKPI[] al formato plano que espera Recharts.
// null = sin datos ese mes → Recharts no renderiza barra (mejor que 0).
type ChartRow = { month: string; alta: number | null; media: number | null; baja: number | null };

function toChartData(history: MonthlyKPI[]): ChartRow[] {
  return history.map(m => {
    const get = (u: UrgencyLevel) => {
      const kpi = m.byUrgency.find(k => k.urgency === u);
      return kpi && kpi.n > 0 ? kpi.avgHours : null;
    };
    return { month: m.monthLabel, alta: get('high'), media: get('medium'), baja: get('low') };
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function MetricsScreen({ workshopId }: MetricsScreenProps) {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!workshopId) return;

    async function fetchData() {
      setLoading(true);
      setError('');

      const { start: mStart, end: mEnd } = getMonthBounds();
      const { start: hStart, end: hEnd } = getSixMonthsBounds();

      const [responseMonth, cycleMonth, responseHist, cycleHist] = await Promise.all([
        // A — mes actual: respuesta del cliente
        supabase
          .from('orders')
          .select('urgency, budget_shared_at, approved_at')
          .eq('workshop_id', workshopId)
          .not('budget_shared_at', 'is', null)
          .not('approved_at', 'is', null)
          .gte('budget_shared_at', mStart)
          .lte('budget_shared_at', mEnd),

        // B — mes actual: ciclo total
        supabase
          .from('orders')
          .select('urgency, created_at, delivered_at')
          .eq('workshop_id', workshopId)
          .not('delivered_at', 'is', null)
          .gte('delivered_at', mStart)
          .lte('delivered_at', mEnd),

        // C — histórico 6 meses: respuesta del cliente
        supabase
          .from('orders')
          .select('urgency, budget_shared_at, approved_at')
          .eq('workshop_id', workshopId)
          .not('budget_shared_at', 'is', null)
          .not('approved_at', 'is', null)
          .gte('budget_shared_at', hStart)
          .lte('budget_shared_at', hEnd),

        // D — histórico 6 meses: ciclo total
        supabase
          .from('orders')
          .select('urgency, created_at, delivered_at')
          .eq('workshop_id', workshopId)
          .not('delivered_at', 'is', null)
          .gte('delivered_at', hStart)
          .lte('delivered_at', hEnd),
      ]);

      if (responseMonth.error || cycleMonth.error || responseHist.error || cycleHist.error) {
        setError('No se pudieron cargar los datos. Inténtalo de nuevo.');
        setLoading(false);
        return;
      }

      setData({
        responseKPIs: groupByUrgency(responseMonth.data ?? [], 'budget_shared_at', 'approved_at'),
        cycleKPIs:    groupByUrgency(cycleMonth.data ?? [],    'created_at',        'delivered_at'),
        responseHistory: groupByMonth(responseHist.data ?? [], 'budget_shared_at', 'budget_shared_at', 'approved_at'),
        cycleHistory:    groupByMonth(cycleHist.data ?? [],    'delivered_at',      'created_at',       'delivered_at'),
      });
      setLoading(false);
    }

    fetchData();
  }, [workshopId]);

  // ---------------------------------------------------------------------------
  // Render states
  // ---------------------------------------------------------------------------

  if (loading) {
    return (
      <div className="space-y-4">
        <SectionHeader />
        <div className="bg-[#131D3B] rounded-[32px] p-10 border border-white/10 text-center">
          <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Cargando datos...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <SectionHeader />
        <div className="bg-[#131D3B] rounded-[32px] p-8 border border-red-500/20 text-center">
          <p className="text-red-400 text-sm font-bold">{error}</p>
        </div>
      </div>
    );
  }

  const hasCurrentMonthData =
    data !== null && (
      data.responseKPIs.some(k => k.n > 0) ||
      data.cycleKPIs.some(k => k.n > 0)
    );

  return (
    <div className="space-y-5">
      <SectionHeader />

      {/* ------------------------------------------------------------------ */}
      {/* Mes actual                                                           */}
      {/* ------------------------------------------------------------------ */}

      {!hasCurrentMonthData && (
        <div className="bg-[#131D3B] rounded-[32px] p-12 border border-white/10 text-center space-y-3">
          <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mx-auto">
            <span className="text-2xl">📊</span>
          </div>
          <p className="text-white font-black text-sm uppercase tracking-tight">Sin datos este mes</p>
          <p className="text-slate-500 text-xs font-bold leading-relaxed max-w-xs mx-auto">
            Los datos aparecerán cuando se envíen informes y se entreguen vehículos registrando la fecha de cierre.
          </p>
        </div>
      )}

      {hasCurrentMonthData && data && (
        <>
          <KPIBlock
            title="Respuesta del cliente"
            description="Desde que se envía el presupuesto hasta que el cliente lo acepta"
            kpis={data.responseKPIs}
          />
          <KPIBlock
            title="Ciclo total del trabajo"
            description="Desde la entrada del vehículo hasta la entrega"
            kpis={data.cycleKPIs}
          />
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Histórico 6 meses                                                   */}
      {/* ------------------------------------------------------------------ */}

      {data && (
        <>
          <HistoryChart
            title="Histórico — Respuesta del cliente"
            history={data.responseHistory}
          />
          <HistoryChart
            title="Histórico — Ciclo total"
            history={data.cycleHistory}
          />
        </>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Disclaimer                                                           */}
      {/* ------------------------------------------------------------------ */}

      <p className="text-[10px] text-slate-600 font-bold text-center px-4 leading-relaxed pb-2">
        Solo se incluyen trabajos con informe enviado y cierre registrado dentro de TallerLive.
        Los promedios excluyen trabajos sin urgencia asignada o con datos incompletos.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SectionHeader() {
  return (
    <div className="flex items-center justify-between px-1">
      <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Rendimiento</h2>
      <span className="text-[10px] font-bold text-slate-600 uppercase tracking-widest">{currentMonthLabel()}</span>
    </div>
  );
}

function KPIBlock({ title, description, kpis }: { title: string; description: string; kpis: UrgencyKPI[] }) {
  const hasAny = kpis.some(k => k.n > 0);

  return (
    <div className="bg-[#131D3B] rounded-[32px] p-6 border border-white/10 space-y-4">
      <div>
        <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.15em]">{title}</h3>
        <p className="text-[10px] text-slate-600 font-bold mt-0.5 leading-relaxed">{description}</p>
      </div>

      {!hasAny ? (
        <p className="text-[11px] text-slate-600 font-bold text-center py-2">Sin datos suficientes este mes</p>
      ) : (
        <div className="space-y-2">
          {kpis.map(kpi => (
            <div
              key={kpi.urgency}
              className={`${URGENCY_BG[kpi.urgency]} rounded-2xl px-4 py-3 flex items-center justify-between`}
            >
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-black uppercase tracking-widest ${URGENCY_COLORS[kpi.urgency]}`}>
                  {URGENCY_LABELS[kpi.urgency]}
                </span>
                {kpi.n > 0 && (
                  <span className="text-[9px] font-bold text-slate-600">n={kpi.n}</span>
                )}
              </div>
              <span className={`text-base font-black ${kpi.n > 0 ? URGENCY_COLORS[kpi.urgency] : 'text-slate-700'}`}>
                {kpi.n > 0 ? formatDuration(kpi.avgHours) : '—'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function HistoryChart({ title, history }: { title: string; history: MonthlyKPI[] }) {
  const hasAny = history.some(m => m.byUrgency.some(k => k.n > 0));
  const chartData = toChartData(history);

  return (
    <div className="bg-[#131D3B] rounded-[32px] p-6 border border-white/10 space-y-4">
      <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.15em]">{title}</h3>

      {!hasAny ? (
        <p className="text-[11px] text-slate-600 font-bold text-center py-4">Sin histórico disponible aún</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }} barCategoryGap="30%">
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#64748b', fontSize: 10, fontWeight: 700 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tickFormatter={(v: number) => formatDuration(v)}
              tick={{ fill: '#64748b', fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              width={42}
            />
            <Tooltip
              formatter={(value: number, name: string) => [formatDuration(value), name]}
              contentStyle={{
                backgroundColor: '#0a0f2e',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '12px',
                fontSize: '11px',
                fontWeight: 700,
              }}
              labelStyle={{ color: '#94a3b8', marginBottom: 4 }}
              cursor={{ fill: 'rgba(255,255,255,0.03)' }}
            />
            <Legend
              wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingTop: '12px' }}
              iconType="circle"
              iconSize={8}
            />
            <Bar dataKey="alta"  name="Alta"  fill={CHART_COLORS.high}   radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Bar dataKey="media" name="Media" fill={CHART_COLORS.medium} radius={[3, 3, 0, 0]} maxBarSize={18} />
            <Bar dataKey="baja"  name="Baja"  fill={CHART_COLORS.low}    radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
