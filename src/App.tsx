import React, { useState, useEffect } from 'react';
import { 
  Wrench, 
  Camera, 
  Mic, 
  Clock, 
  CheckCircle2, 
  FileText, 
  AlertCircle,
  MessageSquare, 
  Plus, 
  Search,
  ChevronRight,
  Filter,
  Phone,
  ArrowRight,
  X,
  RefreshCw,
  Settings as SettingsIcon,
  CheckCircle,
  Check,
  Trash2,
  Edit2,
  Info,
  Terminal
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from './lib/utils';
import { supabase, type Order, type Vehicle, type Customer } from './lib/supabase';
import { transcribeAndDiagnose, isGeminiConfigured } from './services/geminiService';
import { AudioRecorder } from './services/audioService';

// --- Tipos ---
type JobStatus = 'waiting' | 'diagnosed' | 'waiting_customer' | 'repairing' | 'ready' | 'awaiting_diagnosis' | 'diagnosing';
type Urgency = 'low' | 'medium' | 'high';

// --- Constantes de configuración ---
const CURRENT_WORKSHOP_ID = import.meta.env.VITE_WORKSHOP_ID || '';

// --- Datos de Prueba (Fallback) ---
const MOCK_JOBS: any[] = [
  {
    id: '1',
    plate: '1234-LMN',
    model: 'Volkswagen Golf GTI',
    customer: 'Carlos Rodríguez',
    customerPhone: '600000001',
    status: 'waiting',
    urgency: 'high',
    entryTime: '08:30',
    description: 'Pérdida de potencia y humo blanco.'
  },
  {
    id: '2',
    plate: '5678-BCC',
    model: 'Toyota Corolla',
    customer: 'Elena Martínez',
    customerPhone: '600000002',
    status: 'waiting_customer',
    urgency: 'medium',
    entryTime: '09:15',
    description: 'Revisión 60.000km y ruido en frenos.'
  }
];

// --- Componentes Auxiliares ---

const UrgencyBadge = ({ urgency }: { urgency: 'low' | 'medium' | 'high' }) => {
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

const StatusBadge = ({ status }: { status: JobStatus }) => {
  const config: Record<string, { label: string; color: string }> = {
    // Estados actuales
    waiting:          { label: 'En espera',         color: 'bg-[#EDEDED] text-[#787878] border-[#D0D0D0]' },
    diagnosed:        { label: 'Diagnosticado',      color: 'bg-[#F0EBE0] text-[#7B6347] border-[#D4C4A0]' },
    waiting_customer: { label: 'En espera cliente',  color: 'bg-[#F2E8D0] text-[#7A5C2A] border-[#CDAC70]' },
    repairing:        { label: 'En preparación',     color: 'bg-[#D5E2F0] text-[#2E4870] border-[#7AAAD0]' },
    ready:            { label: 'Listo ✓',            color: 'bg-[#C8E6C4] text-[#2E5E35] border-[#7AB87A]' },
    // Legado (datos existentes en BD)
    awaiting_diagnosis: { label: 'En espera',        color: 'bg-[#EDEDED] text-[#787878] border-[#D0D0D0]' },
    diagnosing:         { label: 'Diagnosticado',     color: 'bg-[#F0EBE0] text-[#7B6347] border-[#D4C4A0]' },
  };

  const { label, color } = config[status];
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border", color)}>
      {label}
    </span>
  );
};

// --- WORKFLOW TRACKER ---

const WORKFLOW_STEPS = [
  { key: 'photo',  label: 'Fotos',     Icon: Camera         },
  { key: 'audio',  label: 'Grabación', Icon: Mic            },
  { key: 'budget', label: 'Informe',   Icon: FileText       },
  { key: 'shared', label: 'Envío',     Icon: MessageSquare  },
] as const;

const getStepsDone = (job: any): boolean[] => [
  (job.photos?.length ?? 0) > 0,
  (job.audios?.length ?? 0) > 0,
  parseFloat(job.budget ?? '0') > 0,
  job.budgetShared === true,
];

const WorkflowTracker = ({ job, onStepClick }: { job: any; onStepClick?: (step: number) => void }) => {
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
const getNextAction = (job: any) => {
  if (!(job.photos?.length > 0))            return { label: 'Capturar fotos',            Icon: Camera,        variant: 'blue',  action: 'photo'  } as const;
  if (!(job.audios?.length > 0))            return { label: 'Registrar grabación',       Icon: Mic,           variant: 'blue',  action: 'audio'  } as const;
  if (!(parseFloat(job.budget ?? '0') > 0)) return { label: 'Crear informe',             Icon: FileText,      variant: 'blue',  action: 'budget' } as const;
  if (!job.budgetShared)                    return { label: 'Enviar informe presupuesto', Icon: MessageSquare, variant: 'blue',  action: 'share'  } as const;
  if (job.status === 'repairing')          return { label: 'Finalizar reparación',   Icon: CheckCircle2,   variant: 'green', action: 'finish' } as const;
  return null;
};

// --- UTILIDADES ---
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // Fallback if randomUUID fails for some reason
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

// --- Utilidad: Comprimir imagen antes de subir ---
const compressImage = (file: File, maxWidth = 800, quality = 0.7): Promise<{ blob: Blob; base64: string }> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const reader = new FileReader();

    reader.onloadend = () => {
      img.onload = () => {
        let w = img.width;
        let h = img.height;

        if (w > maxWidth) {
          h = Math.round((h * maxWidth) / w);
          w = maxWidth;
        }

        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('No canvas context')); return; }
        ctx.drawImage(img, 0, 0, w, h);

        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('Compression failed')); return; }
            const compressedReader = new FileReader();
            compressedReader.onloadend = () => {
              resolve({ blob, base64: compressedReader.result as string });
            };
            compressedReader.readAsDataURL(blob);
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = () => reject(new Error('Error loading image'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Error reading file'));
    reader.readAsDataURL(file);
  });
};

// --- Transformación única: Supabase order row → job de React ---
// Única fuente de verdad para la estructura de un job en el frontend.
// Usada por fetchJobsFromSupabase y refreshSingleJob.
const mapOrderToJob = (order: any): any => ({
  id: order.id,
  plate: order.vehicle?.plate,
  model: order.vehicle?.model,
  customer: order.customer?.name,
  customerPhone: order.customer?.phone,
  status: order.status,
  budget: order.budget?.toString() || '0',
  aiDiagnosis: order.description,
  budgetShared: order.status === 'waiting_customer' || order.status === 'repairing' || order.status === 'ready',
  urgency: order.urgency,
  entryTime: new Date(order.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  description: order.description,
  public_token: order.public_token,
  photos: order.media?.filter((m: any) => m.media_type === 'image').map((m: any) => m.file_url) || [],
  audios: order.media?.filter((m: any) => m.media_type === 'audio').map((m: any) => m.file_url) || [],
  audioNotes: order.media?.filter((m: any) => m.media_type === 'audio' && m.note).map((m: any) => m.note) || []
});

export default function TallerLivePrototype() {
  const path = window.location.pathname;

  if (path.startsWith("/d/")) {
    const token = path.split("/d/")[1];
    // PublicReport no existe — redirigimos a la vista de cliente con query param
    if (token) {
      window.location.href = `${window.location.origin}?t=${token}`;
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      );
    }
  }
  const [jobs, setJobs] = useState<any[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [budgetAmount, setBudgetAmount] = useState<string>('');
  const [diagnosisText, setDiagnosisText] = useState<string>('');
  const [viewMode, setViewMode] = useState<'taller' | 'client'>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('orderId') ? 'client' : 'taller';
  });
  const [clientJob, setClientJob] = useState<any>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string>(() => {
    return localStorage.getItem('tallerlive_public_url') || '';
  });
  const [isApproved, setIsApproved] = useState(false);
  const [activeTab, setActiveTab] = useState<'taller' | 'historial' | 'clientes' | 'ajustes'>('taller');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isClientLoading, setIsClientLoading] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!params.get('orderId');
  });
  const [expandedDiagnosis, setExpandedDiagnosis] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<{id: string, message: string, type: 'success' | 'error' | 'info'}[]>([]);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const addLog = (msg: string) => {
    console.log(msg);
    setDebugLogs(prev => [msg, ...prev].slice(0, 50));
  };

  const notify = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(7);
    setNotifications(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<any>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');

  // Detección honesta de Supabase
  const isSupabaseConnected = React.useMemo(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    return !!(url && key && !url.includes('placeholder'));
  }, []);

  // =============================================
  // FUNCIÓN CENTRAL: Supabase = única fuente de verdad
  // =============================================
  const fetchJobsFromSupabase = React.useCallback(async (): Promise<any[]> => {
    if (!isSupabaseConnected) return [];
    try {
      const { data } = await supabase
        .from('orders')
        .select(`
          *,
          vehicle:vehicles(*),
          customer:customers(*),
          media:order_media(*)
        `)
        .order('created_at', { ascending: false });


      if (!data || data.length === 0) return [];

      return data.map(mapOrderToJob);
    } catch (e) {
      console.error('Error fetching jobs from Supabase:', e);
      return [];
    }
  }, [isSupabaseConnected]);

  // Refresca solo 1 job concreto desde Supabase (tras subir foto/audio)
  const refreshSingleJob = React.useCallback(async (jobId: string) => {
    if (!isSupabaseConnected) return;
    try {
      const { data } = await supabase
        .from('orders')
        .select(`*, vehicle:vehicles(*), customer:customers(*), media:order_media(*)`)
        .eq('id', jobId)
        .single();

      if (!data) return;

      const refreshed = mapOrderToJob(data);

      setJobs(prev => {
        const existing = prev.find(j => String(j.id) === String(jobId));
        // Si DB devuelve media vacío, conservar lo que ya hay en estado (optimistic)
        const finalPhotos = refreshed.photos.length > 0 ? refreshed.photos : (existing?.photos || []);
        const finalAudios = refreshed.audios.length > 0 ? refreshed.audios : (existing?.audios || []);
        const finalJob = { ...refreshed, photos: finalPhotos, audios: finalAudios };

        if (existing) return prev.map(j => String(j.id) === String(jobId) ? finalJob : j);
        return [finalJob, ...prev];
      });
    } catch (e: any) {
      console.error('Error refreshing job:', e);
      addLog(`[refreshSingleJob] Fallo al refrescar job ${jobId}: ${e?.message ?? e}`);
    }
  }, [isSupabaseConnected]);

  // Estados para Audio (usa AudioRecorder del servicio)
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const audioRecorderRef = React.useRef<AudioRecorder>(new AudioRecorder());
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  // Formulario Nueva Entrada
  const [formData, setFormData] = useState({
    plate: '',
    model: '',
    customerName: '',
    customerPhone: '',
    description: '',
    urgency: 'medium' as Urgency
  });

  // --- Cargar Clientes y Vehículos ---
  useEffect(() => {
    if (activeTab === 'clientes' && isSupabaseConnected) {
      const fetchCustomersAndVehicles = async () => {
        const { data: customersData } = await supabase.from('customers').select('*').order('name');
        const { data: vehiclesData } = await supabase.from('vehicles').select('*').order('plate');
        if (customersData) setCustomers(customersData);
        if (vehiclesData) setVehicles(vehiclesData);
      };
      fetchCustomersAndVehicles();
    }
  }, [activeTab, isSupabaseConnected]);

  // --- Persistencia: YA NO usamos localStorage para jobs ---
  // Supabase es la única fuente de verdad.
  // Solo guardamos para offline fallback básico (sin media).
  useEffect(() => {
    if (jobs.length > 0 && jobs.some(j => !String(j.id).startsWith('temp-'))) {
      // Solo guardar metadata básica, NUNCA base64
      const lite = jobs.map(j => ({
        id: j.id, plate: j.plate, model: j.model, customer: j.customer,
        customerPhone: j.customerPhone, status: j.status, budget: j.budget,
        urgency: j.urgency, entryTime: j.entryTime, description: j.description,
        public_token: j.public_token,
        // Solo URLs (empiezan con http), nunca base64
        photos: (j.photos || []).filter((p: string) => p.startsWith('http')),
        audios: (j.audios || []).filter((a: string) => a.startsWith('http')),
        aiDiagnosis: j.aiDiagnosis, budgetShared: j.budgetShared
      }));
      localStorage.setItem('tallerlive_jobs', JSON.stringify(lite));
    }
  }, [jobs]);

  // --- MEJORA: Sincronización entre pestañas (SOLO cuando NO hay Supabase) ---
  // Cuando Supabase está conectado, el realtime channel se encarga de sincronizar.
  // Este interval solo sirve para modo offline/demo.
  useEffect(() => {
    if (isSupabaseConnected) return; // ← Supabase tiene su propio realtime, no machacar

    const syncData = () => {
      const savedJobs = localStorage.getItem('tallerlive_jobs');
      if (savedJobs) {
        const updatedJobs = JSON.parse(savedJobs);
        setJobs(updatedJobs);
        
        if (viewMode === 'client' && clientJob) {
          const currentJob = updatedJobs.find((j: any) => String(j.id) === String(clientJob.id));
          if (currentJob) {
            setClientJob(currentJob);
            setIsApproved(currentJob.status === 'repairing');
          }
        }
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'tallerlive_jobs' || !e.key) {
        syncData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    const interval = setInterval(syncData, 1500);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, [viewMode, clientJob, isSupabaseConnected]);

  // --- Sincronización en Tiempo Real con Supabase ---
  useEffect(() => {
    if (!isSupabaseConnected) return;

    const channel = supabase
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        async (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const updatedOrder = payload.new;

            // Un único camino de transformación: fetch completo con order_media.
            // Evita el merge parcial que no incluye photos/audios.
            await refreshSingleJob(updatedOrder.id);

            // Actualizar vista del cliente si es el mismo pedido
            setClientJob(prev => {
              if (prev && String(prev.id) === String(updatedOrder.id)) {
                const isNowApproved = updatedOrder.status === 'repairing' ||
                                     updatedOrder.status === 'ready' ||
                                     updatedOrder.is_accepted === true;

                if (isNowApproved) setIsApproved(true);

                return {
                  ...prev,
                  status: updatedOrder.status,
                  budget: updatedOrder.budget,
                  aiDiagnosis: updatedOrder.description
                };
              }
              return prev;
            });
          } else if (payload.eventType === 'DELETE') {
            setJobs(prevJobs => prevJobs.filter(j => String(j.id) !== String(payload.old.id)));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isSupabaseConnected, refreshSingleJob]);

  // Cargar datos iniciales (LocalStorage + Supabase)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    const dataParam = params.get('d');
    const tokenParam = params.get('t');

    async function initializeApp() {
      // --- Cargar datos locales solo como fallback si NO hay Supabase ---
      let currentJobs: any[] = [];
      if (!isSupabaseConnected) {
        const savedJobs = localStorage.getItem('tallerlive_jobs');
        currentJobs = savedJobs ? JSON.parse(savedJobs) : MOCK_JOBS;
        setJobs(currentJobs);
      }

      // 1. Si viene un token público (Modo Supabase)
      if (tokenParam && isSupabaseConnected) {
        setIsClientLoading(true);
        try {
          const { data, error } = await supabase
            .from('orders')
            .select(`
              *,
              vehicle:vehicles(*),
              customer:customers(*),
              media:order_media(*)
            `)
            .eq('public_token', tokenParam)
            .single();

          if (data) {
            const fetchedJob = {
              id: data.id,
              plate: data.vehicle?.plate,
              model: data.vehicle?.model,
              customer: data.customer?.name,
              customerPhone: data.customer?.phone,
              status: data.status,
              budget: data.budget?.toString() || '0',
              aiDiagnosis: data.description,
              budgetShared: !!data.budget,
              description: data.description,
              public_token: data.public_token,
              entryTime: new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              photos: data.media?.filter((m: any) => m.media_type === 'image').map((m: any) => m.file_url) || [],
              audios: data.media?.filter((m: any) => m.media_type === 'audio').map((m: any) => m.file_url) || []
            };
            setClientJob(fetchedJob);
            setIsApproved(data.status === 'repairing' || data.status === 'ready');
            setViewMode('client');
            setIsClientLoading(false);
            return;
          }
        } catch (e) {
          console.error("Error cargando por token:", e);
        }
      }

      // 2. Si viene información en el link (Modo Autónomo / Legacy)
      if (dataParam) {
        try {
          // Decodificación robusta para caracteres especiales (acentos, etc)
          const decodedData = JSON.parse(decodeURIComponent(escape(atob(dataParam))));
          let job = {
            id: decodedData.id,
            plate: decodedData.p,
            model: decodedData.m,
            customer: decodedData.c,
            budget: decodedData.b,
            description: decodedData.d,
            status: decodedData.s,
            entryTime: 'Hoy',
            photos: decodedData.ph || [],
            aiDiagnosis: decodedData.ai || ''
          };

          // --- MEJORA: Priorizar datos locales si ya existen en este navegador ---
          const localOverride = currentJobs.find((j: any) => String(j.id) === String(job.id));
          if (localOverride) {
            job = { ...job, ...localOverride };
          }

          setClientJob(job);
          setIsApproved(job.status === 'repairing' || job.status === 'ready');
          setViewMode('client');
          
          // --- MEJORA: Buscar datos completos en Supabase (fotos, diagnóstico) ---
          if (isSupabaseConnected) {
            try {
              const { data } = await supabase
                .from('orders')
                .select(`
                  *,
                  media:order_media(*)
                `)
                .eq('id', job.id)
                .single();
              
              if (data) {
                const fullJob = {
                  ...job,
                  status: data.status,
                  photos: data.media?.filter((m: any) => m.media_type === 'image').map((m: any) => m.file_url) || job.photos,
                  audios: data.media?.filter((m: any) => m.media_type === 'audio').map((m: any) => m.file_url) || [],
                  aiDiagnosis: data.description || job.aiDiagnosis,
                  budget: data.budget || job.budget
                };
                setClientJob(fullJob);
                setIsApproved(data.status === 'repairing' || data.status === 'ready' || data.is_accepted === true);
              }
            } catch (e) {
              console.error('Error cargando datos reales de Supabase:', e);
            }
          }
          
          setIsClientLoading(false);
          return;
        } catch (e) {
          console.error("Error decodificando link");
        }
      }

      if (orderId) {
        // 1. Intentar encontrar en local (usando comparación robusta de strings)
        const localJob = currentJobs.find((j: any) => String(j.id) === String(orderId));
        
        if (localJob) {
          setClientJob(localJob);
          setIsApproved(localJob.status === 'repairing' || localJob.status === 'ready');
          setIsClientLoading(false);
        } else {
          // 2. Si no está en local, intentar buscar en Supabase
          try {
            const { data, error } = await supabase
              .from('orders')
              .select(`
                *,
                vehicle:vehicles(*),
                customer:customers(*),
                media:order_media(*)
              `)
              .eq('id', orderId)
              .single();

            if (data) {
              const fetchedJob = {
                id: data.id,
                plate: data.vehicle?.plate,
                model: data.vehicle?.model,
                customer: data.customer?.name,
                customerPhone: data.customer?.phone,
                status: data.status,
                budget: data.budget?.toString() || '0',
                aiDiagnosis: data.description,
                budgetShared: data.status === 'waiting_customer' || data.status === 'repairing' || data.status === 'ready',
                description: data.description,
                entryTime: new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                photos: data.media?.filter((m: any) => m.media_type === 'image').map((m: any) => m.file_url) || [],
                audios: data.media?.filter((m: any) => m.media_type === 'audio').map((m: any) => m.file_url) || []
              };
              
              setClientJob(fetchedJob);
              setIsApproved(data.status === 'repairing' || data.status === 'ready');
            } else {
              setClientError("No hemos podido encontrar tu orden de trabajo. Si es una demo local, recuerda abrir el link en el mismo navegador.");
            }
          } catch (e) {
            setClientError("Error al conectar con el servidor. Inténtalo de nuevo más tarde.");
          } finally {
            setIsClientLoading(false);
          }
        }
      }

      // Cargar todos los trabajos para el modo taller (Supabase = fuente de verdad)
      const supabaseJobs = await fetchJobsFromSupabase();
      if (supabaseJobs.length > 0) {
        setJobs(supabaseJobs);
      }
    }

    initializeApp();
  }, []);

  // (localStorage save is handled above with URL-only filter)

  // Manejo de Fotos (con compresión + persistencia)
  const handlePhotoClick = (jobId: string) => {
    setActiveJobId(jobId);
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeJobId) return;

    const jobId = activeJobId;

    if (String(jobId).startsWith('temp-')) {
      notify("No se pueden subir fotos a un pedido que no se ha sincronizado con Supabase.", 'error');
      return;
    }

    addLog(`Iniciando subida de foto para job: ${jobId}`);

    // Marcar job como "subiendo" para feedback visual inmediato
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, _uploading: true } : j));

    try {
      // 1. Comprimir imagen
      const { blob: compressedBlob } = await compressImage(file, 800, 0.7);
      addLog(`Imagen comprimida: ${(compressedBlob.size / 1024).toFixed(0)}KB`);

      if (!isSupabaseConnected) {
        notify("Sin conexión a Supabase. No se puede subir.", 'error');
        return;
      }

      // 2. Subir a Storage
      const fileName = `${jobId}/${Date.now()}_photo.jpg`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('tallerlife_media')
        .upload(fileName, compressedBlob, { contentType: 'image/jpeg' });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('tallerlife_media')
        .getPublicUrl(uploadData.path);

      addLog(`Imagen subida: ${publicUrl}`);

      // OPTIMISTIC UPDATE: mostrar foto inmediatamente sin esperar a refreshSingleJob
      setJobs(prev => prev.map(j => String(j.id) === String(jobId) ? {
        ...j,
        photos: [...(j.photos || []), publicUrl]
      } : j));

      // 3. Persistir en order_media
      const { error: mediaError } = await supabase
        .from('order_media')
        .insert([{ order_id: jobId, file_url: publicUrl, media_type: 'image' }]);

      if (mediaError) throw mediaError;

      // 4. Actualizar status
      await supabase.from('orders').update({ status: 'waiting' }).eq('id', jobId);

      // 5. CLAVE: Re-fetch este job desde Supabase (fuente de verdad)
      await refreshSingleJob(jobId);

      notify("Imagen subida correctamente", 'success');
    } catch (e: any) {
      console.error('Error subida foto:', e);
      addLog(`Error: ${e.message}`);
      notify(`Error al subir imagen: ${e.message}`, 'error');
    } finally {
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, _uploading: false } : j));
      setActiveJobId(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // --- Lógica de Audio (usa AudioRecorder + geminiService) ---
  const startRecording = async (jobId: string) => {
    try {
      if (!AudioRecorder.isSupported()) {
        notify("Tu navegador no soporta grabación de audio.", 'error');
        return;
      }
      if (!isGeminiConfigured()) {
        notify("La API key de Gemini no está configurada. Revisa tu .env", 'error');
        return;
      }

      const recorder = audioRecorderRef.current;
      await recorder.start();
      setActiveJobId(jobId);
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
      addLog(`Grabación iniciada para job: ${jobId}`);
    } catch (err: any) {
      console.error("Error al acceder al micrófono:", err);
      addLog(`Error micrófono: ${err.message}`);
      notify("Necesitas dar permiso al micrófono para grabar audios.", 'error');
    }
  };

  const stopRecording = async () => {
    if (!isRecording) return;

    setIsRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    const jobId = activeJobId;
    if (!jobId) return;

    try {
      const recorder = audioRecorderRef.current;
      const result = await recorder.stop();

      if (String(jobId).startsWith('temp-')) {
        notify("No se puede guardar audio en un pedido local.", 'error');
        setActiveJobId(null);
        return;
      }

      addLog(`Grabación: ${result.durationSeconds}s, ${(result.blob.size / 1024).toFixed(0)}KB`);

      // 1. Feedback inmediato: marcar como "procesando" (SIN guardar base64 en state)
      setJobs(prev => prev.map(j => j.id === jobId ? {
        ...j,
        aiDiagnosis: "Procesando diagnóstico con IA..."
      } : j));

      // 2. Transcribir con Gemini (usa base64 del resultado, NO lo guarda en state)
      let professionalText = "";
      try {
        addLog(`Enviando audio a Gemini...`);
        professionalText = await transcribeAndDiagnose(result.base64, result.mimeType);
        addLog(`Transcripción: "${professionalText.substring(0, 60)}..."`);

        // Feedback intermedio: mostrar diagnóstico mientras sube
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, aiDiagnosis: professionalText } : j));
      } catch (err: any) {
        addLog(`Error IA: ${err.message}`);
        notify(`Error al transcribir: ${err.message}`, 'error');
        setJobs(prev => prev.map(j => j.id === jobId ? { ...j, aiDiagnosis: "Error al procesar diagnóstico." } : j));
        setActiveJobId(null);
        return;
      }

      // 3. Persistir en Supabase (Storage + order_media + orders)
      if (isSupabaseConnected) {
        try {
          const fileName = `${jobId}/${Date.now()}_audio.webm`;
          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('tallerlife_media')
            .upload(fileName, result.blob);

          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage
            .from('tallerlife_media')
            .getPublicUrl(uploadData.path);

          addLog(`Audio subido: ${publicUrl}`);

          // OPTIMISTIC UPDATE: mostrar audio inmediatamente sin esperar a refreshSingleJob
          setJobs(prev => prev.map(j => String(j.id) === String(jobId) ? {
            ...j,
            audios: [...(j.audios || []), publicUrl]
          } : j));

          await supabase.from('order_media').insert([{
            order_id: jobId,
            file_url: publicUrl,
            media_type: 'audio',
            note: professionalText
          }]);

          await supabase.from('orders').update({
            description: professionalText,
            status: 'waiting'
          }).eq('id', jobId);

          // 4. CLAVE: Re-fetch desde Supabase (fuente de verdad)
          await refreshSingleJob(jobId);

          notify("Audio procesado y guardado", 'success');
        } catch (err: any) {
          addLog(`Error Supabase: ${err.message}`);
          notify(`Error al guardar: ${err.message}`, 'error');
        }
      }

      setActiveJobId(null);
    } catch (err: any) {
      console.error("Error grabación:", err);
      addLog(`Error: ${err.message}`);
      notify("Error al procesar la grabación.", 'error');
      setActiveJobId(null);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Lógica de Presupuesto ---
  const openBudgetModal = (jobId: string) => {
    setActiveJobId(jobId);
    const job = jobs.find(j => j.id === jobId);
    setBudgetAmount(job?.budget || '0');
    setDiagnosisText(job?.aiDiagnosis || '');
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudget = async () => {
    if (activeJobId) {
      const budgetToSave = budgetAmount || '0';
      const diagnosisToSave = diagnosisText;
      const currentJob = jobs.find(j => j.id === activeJobId);
      const shouldAdvance = ['waiting', 'awaiting_diagnosis', 'diagnosing'].includes(currentJob?.status || '');

      setJobs(prevJobs => prevJobs.map(job =>
        job.id === activeJobId
          ? { ...job, budget: budgetToSave, aiDiagnosis: diagnosisToSave, description: diagnosisToSave, ...(shouldAdvance ? { status: 'diagnosing' } : {}) }
          : job
      ));

      if (isSupabaseConnected) {
        try {
          const { error } = await supabase
            .from('orders')
            .update({
              budget: Number(budgetToSave),
              total_estimated: Number(budgetToSave),
              description: diagnosisToSave,
              workshop_id: CURRENT_WORKSHOP_ID,
              ...(shouldAdvance ? { status: 'diagnosing' } : {})
            })
            .eq('id', activeJobId);
          if (error) console.error(error);
        } catch (e) {
          console.error('Error sincronizando presupuesto:', e);
        }
      }

      setIsBudgetModalOpen(false);
      setActiveJobId(null);
      setBudgetAmount('');
      setDiagnosisText('');
    }
  };

  const handleWhatsAppShare = (job: any, skipStateUpdate = false) => {
    if (!job.budget || parseFloat(job.budget) < 0) {
      alert("Debes ingresar un presupuesto antes de enviarlo por WhatsApp.");
      return;
    }

    if (!skipStateUpdate) {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, budgetShared: true, status: 'waiting_customer' } : j));
      if (isSupabaseConnected) {
        supabase.from('orders').update({ status: 'waiting_customer' }).eq('id', job.id).then();
      }
    }

    // Usamos la URL pública configurada o la actual como fallback
    const baseUrl = publicUrl || window.location.origin;
    
    let magicLink;
    if (job.public_token) {
      magicLink = `${baseUrl}?t=${job.public_token}`;
    } else {
      // Fallback a base64 si no hay token (para modo local o transiciones)
      const jobData = {
        id: job.id,
        p: job.plate,
        m: job.model,
        c: job.customer,
        b: job.budget,
        d: job.description,
        s: job.status
      };
      const encodedData = btoa(unescape(encodeURIComponent(JSON.stringify(jobData))));
      magicLink = `${baseUrl}?d=${encodedData}`;
    }
    
    const message = `*📋 INFORME DE TALLER - AUTOMOCIÓN MENDOZA*\n\n` +
                    `Hola *${job.customer}*,\n\n` +
                    `Hemos revisado su vehículo *${job.model}* (${job.plate}).\n\n` +
                    `💰 *PRESUPUESTO: ${job.budget || '---'}€*\n\n` +
                    `Puede ver las fotos y aprobar la reparación aquí:\n` +
                    `🔗 ${magicLink}\n\n` +
                    `Gracias por su confianza.`;

    const encodedMessage = encodeURIComponent(message);
    // Limpiamos el teléfono de espacios y aseguramos el formato internacional
    let phone = job.customerPhone?.replace(/\D/g, '') || '';
    if (phone.length === 9) phone = `34${phone}`;
    
    if (!phone) {
      alert("No hay número de teléfono asociado a este cliente.");
      return;
    }

    window.location.href = `whatsapp://send?phone=${phone}&text=${encodedMessage}`;
  };

  const handleReadyNotification = (job: any) => {
    const message = `*✅ VEHÍCULO FINALIZADO - AUTOMOCIÓN MENDOZA*\n\n` +
                    `Estimado/a *${job.customer}*,\n\n` +
                    `Le informamos que la reparación de su vehículo *${job.model}* (${job.plate}) ha sido completada.\n\n` +
                    `Su vehículo ya está listo y puede pasar a recogerlo por nuestras instalaciones cuando lo desee.\n\n` +
                    `Atentamente,\nEl equipo de Automoción Mendoza.`;

    const encodedMessage = encodeURIComponent(message);
    let phone = job.customerPhone?.replace(/\D/g, '') || '';
    if (phone.length === 9) phone = `34${phone}`;
    
    if (phone) {
      window.location.href = `whatsapp://send?phone=${phone}&text=${encodedMessage}`;
    }

    // Si hay email, también intentamos abrir el cliente de correo
    if (job.customerEmail) {
      const subject = encodeURIComponent(`Vehículo Listo para Recoger - ${job.plate}`);
      const body = encodeURIComponent(message.replace(/\*/g, '')); // Quitamos los asteriscos de negrita de WhatsApp
      window.open(`mailto:${job.customerEmail}?subject=${subject}&body=${body}`, '_blank');
    }
  };

  // --- Polling: Supabase = fuente de verdad (sin merge local) ---
  useEffect(() => {
    if (viewMode === 'taller' && isSupabaseConnected) {
      const interval = setInterval(async () => {
        const fresh = await fetchJobsFromSupabase();
        if (fresh.length > 0) {
          setJobs(prev => {
            // Mantener solo jobs temporales (temp-) que aún no están en Supabase
            const tempJobs = prev.filter(j => String(j.id).startsWith('temp-'));
            return [...fresh, ...tempJobs];
          });
        }
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [viewMode, isSupabaseConnected, fetchJobsFromSupabase]);

  const handleDeleteJob = async (jobId: string) => {
    // Optimistic update
    setJobs(prev => prev.filter(j => String(j.id) !== String(jobId)));
    
    if (isSupabaseConnected) {
      try {
        const { error } = await supabase.from('orders').delete().eq('id', jobId);
        if (error) throw error;
      } catch (e) {
        console.error('Error eliminando en Supabase:', e);
        // Si falla, podríamos recargar para asegurar consistencia
      }
    }
  };

  const handleEditJob = (job: any) => {
    setEditingJob(job);
    setFormData({
      plate: job.plate,
      model: job.model,
      customerName: job.customer,
      customerPhone: job.customerPhone,
      description: job.description,
      urgency: job.urgency
    });
    setIsEditModalOpen(true);
  };

  const handleUpdateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingJob) return;

    const updatedJob = {
      ...editingJob,
      plate: formData.plate,
      model: formData.model,
      customer: formData.customerName,
      customerPhone: formData.customerPhone,
      description: formData.description,
      urgency: formData.urgency
    };

    setJobs(prev => prev.map(j => j.id === editingJob.id ? updatedJob : j));
    setIsEditModalOpen(false);
    setEditingJob(null);
    setFormData({ plate: '', model: '', customerName: '', customerPhone: '', description: '', urgency: 'medium' });

    if (isSupabaseConnected) {
      try {
        await supabase.from('orders').update({
          urgency: formData.urgency,
          description: formData.description
        }).eq('id', editingJob.id);
      } catch (e) {
        console.error('Error actualizando en Supabase:', e);
      }
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (isSupabaseConnected) {
        let customerId = selectedCustomerId;
        let vehicleId = selectedVehicleId;

        console.log("Iniciando creación de pedido en Supabase...");

        // 1. Si no hay cliente seleccionado, buscar por teléfono o crear
        if (!customerId) {
          console.log("Buscando cliente por teléfono:", formData.customerPhone);
          const { data: existingCustomer, error: findCustError } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', formData.customerPhone)
            .maybeSingle();
          
          if (findCustError) console.warn("Error buscando cliente:", findCustError);

          if (existingCustomer) {
            console.log("Cliente encontrado:", existingCustomer.id);
            customerId = existingCustomer.id;
          } else {
            console.log("Creando nuevo cliente:", formData.customerName);
            const { data: customer, error: customerError } = await supabase
              .from('customers')
              .insert([{ 
                name: formData.customerName, 
                phone: formData.customerPhone
              }])
              .select()
              .single();

            if (customerError) {
              console.error("Error al insertar cliente:", customerError);
              throw customerError;
            }
            customerId = customer.id;
          }
        }

        // 2. Si no hay vehículo seleccionado, buscar por matrícula o crear
        if (!vehicleId) {
          const plateUpper = formData.plate.toUpperCase().trim();
          console.log("Buscando vehículo por matrícula:", plateUpper);
          const { data: existingVehicle, error: findVehError } = await supabase
            .from('vehicles')
            .select('id')
            .eq('plate', plateUpper)
            .maybeSingle();

          if (findVehError) console.warn("Error buscando vehículo:", findVehError);

          if (existingVehicle) {
            console.log("Vehículo encontrado:", existingVehicle.id);
            vehicleId = existingVehicle.id;
          } else {
            console.log("Creando nuevo vehículo:", plateUpper);
            const { data: vehicle, error: vehicleError } = await supabase
              .from('vehicles')
              .insert([{ 
                plate: plateUpper, 
                model: formData.model, 
                customer_id: customerId 
              }])
              .select()
              .single();

            if (vehicleError) {
              console.error("Error al insertar vehículo:", vehicleError);
              throw vehicleError;
            }
            vehicleId = vehicle.id;
          }
        }

        // 3. Crear Orden
        console.log("Insertando orden en Supabase...");
        const { data: order, error: orderError } = await supabase
          .from('orders')
          .insert([{ 
            vehicle_id: vehicleId, 
            customer_id: customerId,
            status: 'waiting',
            urgency: formData.urgency,
            description: formData.description,
            public_token: generateUUID(),
            total_estimated: 0
          }])
          .select()
          .single();

        if (orderError) {
          console.error("Error al insertar orden:", orderError);
          throw orderError;
        }

        console.log("Orden creada con éxito:", order.id);

        // Actualizar UI Local
        const newJob = {
          id: order.id,
          plate: formData.plate.toUpperCase(),
          model: formData.model,
          customer: formData.customerName,
          customerPhone: formData.customerPhone,
          status: 'waiting',
          urgency: formData.urgency,
          entryTime: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          description: formData.description,
          photos: [],
          audios: []
        };

        setJobs(prev => [newJob, ...prev]);
        setIsModalOpen(false);
        setFormData({ plate: '', model: '', customerName: '', customerPhone: '', description: '', urgency: 'medium' });
        setSelectedCustomerId(null);
        setSelectedVehicleId(null);
      } else {
        throw new Error('No Supabase connection');
      }
    } catch (error: any) {
      console.error('Error crítico creando entrada:', error);
      addLog(`Error creación pedido: ${error.message}`);
      // Fallback local con ID temporal
      const localJob = {
        id: 'temp-' + Date.now(),
        plate: formData.plate.toUpperCase(),
        model: formData.model,
        customer: formData.customerName,
        customerPhone: formData.customerPhone,
        status: 'waiting',
        urgency: formData.urgency,
        entryTime: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        description: formData.description,
        photos: [],
        audios: []
      };
      setJobs(prev => [localJob, ...prev]);
      setIsModalOpen(false);
      setFormData({ plate: '', model: '', customerName: '', customerPhone: '', description: '', urgency: 'medium' });
      notify("Error al guardar en la base de datos. El pedido se ha guardado localmente.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveBudget = async () => {
    if (!clientJob || isApproved) return;
    
    // Bloqueo inmediato de UI
    setIsApproved(true);
    const updatedStatus = 'repairing';
    
    // 1. Verificar estado real en Supabase antes de proceder (Doble verificación)
    if (isSupabaseConnected) {
      try {
        const { data: currentOrder } = await supabase
          .from('orders')
          .select('status, is_accepted')
          .eq('id', clientJob.id)
          .single();
        
        if (currentOrder && (currentOrder.status === 'repairing' || currentOrder.is_accepted === true)) {
          console.log("Ya estaba aprobado en el servidor");
          return; // Ya está aprobado, no hacemos nada más
        }
      } catch (e) {
        console.error("Error en pre-verificación");
      }
    }

    // 2. Actualizar estados locales de React
    const updatedJob = { ...clientJob, status: updatedStatus };
    setClientJob(updatedJob);
    
    setJobs(prevJobs => {
      const exists = prevJobs.find(j => String(j.id) === String(clientJob.id));
      let newJobs;
      if (exists) {
        newJobs = prevJobs.map(job => 
          String(job.id) === String(clientJob.id) ? { ...job, status: updatedStatus } : job
        );
      } else {
        newJobs = [updatedJob, ...prevJobs];
      }
      localStorage.setItem('tallerlive_jobs', JSON.stringify(newJobs)); // cross-tab sync
      return newJobs;
    });

    // 3. Notificar a otras pestañas
    window.dispatchEvent(new Event('storage'));

    // 4. Actualizar en Supabase de forma atómica
    if (isSupabaseConnected && !String(clientJob.id).startsWith('temp-')) {
      try {
        const { error } = await supabase
          .from('orders')
          .update({ 
            status: updatedStatus
          })
          .eq('id', clientJob.id);
          
        if (error) {
          console.error('Error de Supabase al aprobar presupuesto:', error);
        }
      } catch (e) {
        console.error('Error de red/conexión en Supabase:', e);
      }
    }
  };

  if (viewMode === 'client') {
    if (isClientLoading) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="text-center space-y-4">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Cargando tu informe...</p>
          </div>
        </div>
      );
    }

    if (clientError || !clientJob) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-[40px] shadow-xl border border-slate-100 text-center max-w-sm">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle size={32} />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2 uppercase">¡Vaya! Algo ha fallado</h2>
            <p className="text-slate-500 font-medium mb-8">{clientError || "No hemos podido cargar la información de tu vehículo."}</p>
            <button 
              onClick={() => window.location.href = window.location.origin}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest"
            >
              Ir a la web principal
            </button>
            
            <div className="mt-8 pt-6 border-t border-slate-100 text-left">
              <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">¿Problemas al cargar?</p>
              <ul className="text-[10px] text-slate-400 space-y-1 list-disc pl-3">
                <li>Si ves "Page not found", asegúrate de haber iniciado sesión en Google.</li>
                <li>Si ves un error de cookies, pulsa "Autenticar en nueva ventana".</li>
                <li>Esto es temporal mientras Google actualiza sus sistemas.</li>
              </ul>
            </div>
          </div>
        </div>
      );
    }

    if (isApproved) {
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
          <p className="text-blue-400 text-xs font-bold mt-1">Automoción Mendoza, S.L.</p>
        </header>

        <main className="p-5 space-y-6 -mt-6 pb-20">
          {/* Datos del vehículo */}
          <div className="bg-white rounded-[32px] p-6 shadow-xl border border-slate-100">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Vehículo</span>
                <h3 className="text-2xl font-black text-slate-900">{clientJob.plate}</h3>
                <p className="text-slate-500 font-bold text-base">{clientJob.model}</p>
              </div>
              <StatusBadge status={clientJob.status} />
            </div>

            {/* Presupuesto + foto principal */}
            <div className="space-y-5">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Presupuesto Estimado</span>
                <div className="flex items-center justify-between">
                  <span className="text-4xl font-black text-blue-600">{clientJob.budget || '0'}€</span>
                  {clientJob.photos?.length > 0 && (
                    <div className="w-20 h-20 rounded-xl overflow-hidden border-2 border-white shadow-md shrink-0">
                      <img src={clientJob.photos[0]} alt="Evidencia" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              {/* Diagnóstico IA */}
              {clientJob.aiDiagnosis && (
                <div className="bg-blue-50 p-5 rounded-[24px] border border-blue-100 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Wrench size={40} className="text-blue-600" />
                  </div>
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block mb-3">Informe de Diagnóstico</span>
                  <p className="text-slate-800 font-bold text-base leading-relaxed relative z-10">
                    {clientJob.aiDiagnosis}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Evidencias del Taller */}
          {(clientJob.photos?.length > 0 || clientJob.audios?.length > 0) && (
            <div className="space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Evidencias del Taller</h3>
              
              {clientJob.photos?.length > 0 && (
                <div className="space-y-3">
                  {clientJob.photos.map((photo: string, i: number) => (
                    <div key={i} className="rounded-2xl overflow-hidden border-2 border-white shadow-lg" style={{ maxWidth: '100%' }}>
                      <img 
                        src={photo} 
                        alt={`Evidencia ${i + 1}`} 
                        className="w-full object-cover rounded-2xl"
                        style={{ maxHeight: '400px' }}
                      />
                    </div>
                  ))}
                </div>
              )}

              {clientJob.audios?.length > 0 && (
                <div className="space-y-3">
                  {clientJob.audios.map((audio: string, i: number) => (
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
            {!isApproved ? (
              <button 
                onClick={handleApproveBudget}
                className="w-full py-5 bg-emerald-500 text-white rounded-3xl font-black uppercase text-sm shadow-xl shadow-emerald-200 flex items-center justify-center gap-3 active:scale-95 transition-all"
              >
                <CheckCircle2 size={20} />
                Aprobar Presupuesto
              </button>
            ) : (
              <div className="w-full py-5 bg-emerald-100 text-emerald-700 rounded-3xl font-black uppercase text-sm flex items-center justify-center gap-3 border-2 border-emerald-200">
                <CheckCircle2 size={20} />
                Presupuesto Aprobado
              </div>
            )}
            <button 
              onClick={() => window.location.href = window.location.origin}
              className="w-full py-5 mt-3 text-slate-400 font-black uppercase text-xs hover:text-slate-600 transition-colors"
            >
              Contactar con el taller
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
                  <span>Si necesita más información, contacte directamente con Automoción Mendoza.</span>
                </li>
              </ul>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="industrial-bg min-h-screen text-slate-100 font-sans pb-20">
      {/* Notificaciones */}
      <div className="fixed top-4 right-4 z-[1000] flex flex-col gap-2 pointer-events-none">
        {notifications.map(n => (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 50 }}
            className={cn(
              "p-4 rounded-2xl shadow-2xl border pointer-events-auto min-w-[280px] flex items-center gap-3",
              n.type === 'success' ? "bg-emerald-600 border-emerald-500 text-white" :
              n.type === 'error' ? "bg-red-600 border-red-500 text-white" :
              "bg-blue-600 border-blue-50 text-white"
            )}
          >
            <div className="bg-white/20 p-1.5 rounded-lg">
              {n.type === 'success' ? <CheckCircle size={18} /> : 
               n.type === 'error' ? <AlertCircle size={18} /> : 
               <Info size={18} />}
            </div>
            <p className="text-xs font-black uppercase tracking-tight">{n.message}</p>
          </motion.div>
        ))}
      </div>

      {/* Input oculto para simular subida de fotos */}
      <input 
        type="file" 
        accept="image/*" 
        className="hidden" 
        ref={fileInputRef}
        onChange={onFileChange}
      />
      {/* Indicador de Grabación Activo */}
      <AnimatePresence>
        {isRecording && (
          <motion.div 
            initial={{ y: -100 }}
            animate={{ y: 0 }}
            exit={{ y: -100 }}
            className="fixed top-0 inset-x-0 z-[200] bg-red-600 text-white p-4 flex items-center justify-between shadow-xl"
          >
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
              <span className="font-black uppercase tracking-widest text-sm">Grabando Diagnóstico...</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-mono font-bold text-xl">{formatTime(recordingTime)}</span>
              <button 
                onClick={stopRecording}
                className="bg-white text-red-600 px-6 py-2 rounded-full font-black uppercase text-xs shadow-lg active:scale-95 transition-all"
              >
                Detener y Guardar
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-[#14151F] text-white px-5 pt-5 pb-10 rounded-b-[28px] shadow-2xl border-b border-white/[0.08]">
        {!isSupabaseConnected && (
          <div className="bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold py-1 px-3 rounded-full mb-3 text-center">
            MODO DEMO LOCAL: Los links solo funcionan en este navegador
          </div>
        )}

        {/* Fila 1: Logo · [Empresa en desktop] · Acciones */}
        <div className="flex items-center justify-between mb-3">
          {/* Izquierda: TallerLive */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/40">
              <Wrench className="text-white" size={20} />
            </div>
            <div className="flex flex-col">
              <h1 className="text-lg sm:text-xl font-black tracking-tighter uppercase italic text-blue-400 leading-none">TallerLive</h1>
              <div className="flex items-center gap-1 mt-0.5">
                <div className={`w-1.5 h-1.5 rounded-full ${isSupabaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                  {isSupabaseConnected ? 'Conectado' : 'Sin Sincro'}
                </span>
              </div>
            </div>
          </div>

          {/* Centro: Empresa — solo desktop */}
          <div className="hidden sm:flex flex-1 flex-col text-center min-w-0">
            <p className="text-xl font-bold uppercase text-white leading-none">AUTOMOCIÓN MENDOZA</p>
            <p className="text-sm text-blue-400 mt-1">ALFARO</p>
          </div>

          {/* Derecha: Acciones */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={async () => {
                setIsLoading(true);
                const fresh = await fetchJobsFromSupabase();
                if (fresh.length > 0) setJobs(fresh);
                setTimeout(() => setIsLoading(false), 500);
              }}
              className={cn(
                "bg-white/10 p-2 scale-90 rounded-2xl border border-white/10 backdrop-blur-md text-blue-400 hover:bg-white/20 transition-all",
                isLoading && "animate-spin"
              )}
              title="Refrescar Datos"
            >
              <RefreshCw size={20} />
            </button>
            <div className="bg-white/10 p-2 scale-90 rounded-2xl border border-white/10 backdrop-blur-md">
              <SettingsIcon className="text-blue-400" size={22} />
            </div>
          </div>
        </div>

        {/* Fila 2+3: Empresa — solo móvil */}
        <div className="sm:hidden text-center mt-2 mb-2">
          <p className="text-lg font-bold uppercase text-white leading-tight">AUTOMOCIÓN MENDOZA</p>
          <p className="text-xs text-blue-400 mt-1">ALFARO</p>
        </div>

        {/* Fila 4: Buscador */}
        <div className="relative mt-3">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="Buscar matrícula, cliente o modelo..."
            className="w-full bg-white/10 border border-white/20 rounded-2xl py-4 pl-12 pr-4 text-base text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 backdrop-blur-sm placeholder:text-slate-500 font-bold"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
      </header>

      {/* Estadísticas Rápidas - Más compactas */}
      <div className="px-5 -mt-5 grid grid-cols-3 gap-3">
        <StatCard label="En Taller" value={jobs.length} color="text-blue-700" />
        <StatCard label="Pendientes" value={jobs.filter(j => ['waiting', 'diagnosed', 'waiting_customer', 'awaiting_diagnosis', 'diagnosing'].includes(j.status)).length} color="text-orange-600" />
        <StatCard label="Listos" value={jobs.filter(j => j.status === 'ready').length} color="text-[#2E6B40]" />
      </div>

      {/* Lista de Trabajos - Más densa y visual */}
      <main className="p-3 space-y-2.5">
        {activeTab === 'taller' && (
          <>
            {!isSupabaseConnected && (
              <div className="bg-blue-900/30 border border-blue-500/20 p-4 rounded-2xl mb-4">
                <p className="text-[10px] text-blue-300 font-bold uppercase leading-relaxed">
                  💡 <span className="underline">Nota de Sincronización</span>: Como no hay base de datos conectada, los cambios que hagas en el móvil NO aparecerán aquí automáticamente. Prueba a abrir el link en este mismo navegador para ver la magia.
                </p>
              </div>
            )}
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Cola de Trabajo Activa</h2>
              <div className="flex items-center gap-1.5 text-blue-500 font-black text-xs uppercase cursor-pointer">
                <Filter size={14} />
                <span>Filtrar</span>
              </div>
            </div>

            {(() => {
              const filtered = jobs.filter(j =>
                (j.plate || '').toLowerCase().includes((filter || '').toLowerCase()) ||
                (j.model || '').toLowerCase().includes((filter || '').toLowerCase()) ||
                (j.customer || '').toLowerCase().includes((filter || '').toLowerCase())
              );
              const groups = [
                { key: 'waiting',    label: 'En espera',             statuses: ['waiting', 'awaiting_diagnosis'] },
                { key: 'diagnosed',  label: 'Diagnosticados',         statuses: ['diagnosed', 'diagnosing'] },
                { key: 'validation', label: 'En espera del cliente',  statuses: ['waiting_customer'] },
                { key: 'repairing',  label: 'En preparación',         statuses: ['repairing'] },
                { key: 'ready',      label: 'Listos para entrega',    statuses: ['ready'] },
              ];
              return (
                <AnimatePresence>
                  {groups.flatMap(group => {
                    const groupJobs = filtered.filter(j => (group.statuses as string[]).includes(j.status));
                    if (groupJobs.length === 0) return [];
                    return [
                      <div key={`hdr-${group.key}`} className="flex items-center gap-2 px-1 mt-3 mb-1">
                        <span className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em]">{group.label}</span>
                        <div className="flex-1 h-px bg-white/10" />
                        <span className="text-[11px] font-black text-slate-500 tabular-nums">{groupJobs.length}</span>
                      </div>,
                      <div key={`grid-${group.key}`} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {groupJobs.map((job, index) => (
                      <motion.div
                        key={job.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="card-industrial rounded-[16px] py-3 px-4 relative overflow-hidden active:scale-[0.98] transition-transform"
                      >
                  {/* Indicador Lateral de Urgencia */}
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-2",
                    job.urgency === 'high' ? 'bg-red-500' : job.urgency === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
                  )} />

                  <div className="flex justify-between items-center mb-2">
                    <div className="flex flex-col">
                      <span className="text-2xl font-black tracking-tighter text-white leading-none">
                        {job.plate}
                      </span>
                      <span className="text-sm font-semibold text-slate-400 mt-0.5">
                        {job.model}
                      </span>
                    </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleEditJob(job)}
                          className="p-2 text-slate-600 hover:text-blue-400 transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirmId(job.id)}
                          className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                        <StatusBadge status={job.status} />
                      </div>
                  </div>

                  {/* CLIENTE */}
                  <div className="flex items-center justify-between py-1.5 px-3 bg-black/20 rounded-xl border border-white/[0.06] mb-1.5">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-blue-400 uppercase tracking-widest leading-none mb-1">Cliente</span>
                      <h3 className="text-sm font-black text-white leading-none">
                        {(job.customer || '').toUpperCase()}
                      </h3>
                    </div>
                    <span className="text-xs font-black text-slate-400">{job.entryTime}</span>
                  </div>

                  {/* Fotos en miniatura */}
                  {job.photos?.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto pb-1 mb-2" style={{ scrollbarWidth: 'none' }}>
                      {job.photos.map((url: string, i: number) => (
                        <img
                          key={i}
                          src={url}
                          alt={`Foto ${i + 1}`}
                          className="w-14 h-14 rounded-xl object-cover border border-white/20 shrink-0 cursor-pointer"
                          onClick={() => window.open(url, '_blank')}
                        />
                      ))}
                    </div>
                  )}

                  {/* WorkflowTracker */}
                  <WorkflowTracker
                    job={job}
                    onStepClick={(step) => {
                      if (step === 0) handlePhotoClick(job.id);
                      else if (step === 1) isRecording && activeJobId === job.id ? stopRecording() : startRecording(job.id);
                      else if (step === 2) openBudgetModal(job.id);
                      else if (step === 3) handleWhatsAppShare(job);
                    }}
                  />

                  {/* CTA único */}
                  {(() => {
                    const next = getNextAction(job);
                    if (!next) return (
                      <div className="mt-2 flex items-center justify-center gap-2 py-2" style={{ color: '#3FA37A' }}>
                        <CheckCircle size={16} />
                        <span className="text-xs font-black uppercase tracking-widest">Completado</span>
                      </div>
                    );
                    const isThisJobRecording = isRecording && activeJobId === job.id;
                    const handleCTA = () => {
                      if (next.action === 'photo') handlePhotoClick(job.id);
                      else if (next.action === 'audio') isThisJobRecording ? stopRecording() : startRecording(job.id);
                      else if (next.action === 'budget') openBudgetModal(job.id);
                      else if (next.action === 'share') handleWhatsAppShare(job);
                      else if (next.action === 'finish') {
                        const updatedStatus = 'ready';
                        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: updatedStatus } : j));
                        if (isSupabaseConnected) supabase.from('orders').update({ status: updatedStatus }).eq('id', job.id).then();
                        handleReadyNotification(job);
                      }
                    };
                    return (
                      <button
                        onClick={handleCTA}
                        disabled={next.action === 'audio' && isRecording && !isThisJobRecording}
                        className={cn(
                          "mt-2 w-full py-3 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 text-base shadow-md border-b-4 active:border-b-0 active:translate-y-0.5 transition-all",
                          next.action === 'audio' && isThisJobRecording
                            ? "bg-red-500 text-white border-red-700 animate-pulse"
                            : next.variant === 'green'
                              ? "bg-[#3FA37A] text-white border-[#2d7a5a]"
                              : "bg-blue-700 text-white/90 border-blue-900 hover:bg-blue-800 shadow-blue-100",
                          next.action === 'audio' && isRecording && !isThisJobRecording && "opacity-30 cursor-not-allowed"
                        )}
                      >
                        <next.Icon size={16} />
                        {next.action === 'audio' && isThisJobRecording ? 'Detener grabación' : next.label}
                      </button>
                    );
                  })()}
                </motion.div>
              ))}
              </div>
            ];
          })}
        </AnimatePresence>
      );
    })()}
          </>
        )}

        {activeTab === 'ajustes' && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="bg-[#131D3B] rounded-[32px] p-8 border border-white/10">
              <h3 className="text-xl font-black text-white uppercase tracking-tight mb-4">Configuración de Sincronización</h3>
              
              <div className="bg-blue-900/30 p-4 rounded-2xl mb-6 border border-blue-500/20">
                <h4 className="text-[10px] font-black text-blue-300 uppercase mb-2 tracking-widest">⚠️ IMPORTANTE: Activar Realtime</h4>
                <p className="text-[10px] text-blue-400 font-bold leading-relaxed">
                  Para que el dashboard se actualice solo, debes ir a tu panel de Supabase: <br/>
                  <b>Database → Replication → 'supabase_realtime' → Source: 'public' → Enable 'orders' table.</b>
                </p>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#0B132B] border border-white/10 mb-6">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  isSupabaseConnected ? "bg-emerald-900/40 text-emerald-400" : "bg-red-900/40 text-red-400"
                )}>
                  <RefreshCw size={24} className={isSupabaseConnected ? "animate-spin-slow" : ""} />
                </div>
                <div>
                  <p className="text-sm font-black text-white uppercase">
                    {isSupabaseConnected ? "Conexión Activa" : "Modo Local Activo"}
                  </p>
                  <p className="text-xs text-slate-400 font-medium">
                    {isSupabaseConnected 
                      ? "Tus datos se sincronizan en tiempo real con la nube." 
                      : "Los datos solo se guardan en este navegador."}
                  </p>
                </div>
              </div>

              {!isSupabaseConnected && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-400 font-medium leading-relaxed">
                    Para que el móvil y el PC se hablen, necesitas conectar <b>Supabase</b>. Sigue estos pasos:
                  </p>
                  <ol className="space-y-3 text-xs text-slate-400 font-bold uppercase tracking-wide">
                    <li className="flex gap-3">
                      <span className="bg-blue-900/40 text-blue-400 w-5 h-5 rounded-full flex items-center justify-center shrink-0">1</span>
                      <span>Ve a <a href="https://supabase.com" target="_blank" className="text-blue-600 underline">supabase.com</a> y crea un proyecto gratuito.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="bg-blue-900/40 text-blue-400 w-5 h-5 rounded-full flex items-center justify-center shrink-0">2</span>
                      <span>Copia la <b>URL</b> y la <b>Anon Key</b> de la pestaña "API Settings".</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="bg-blue-900/40 text-blue-400 w-5 h-5 rounded-full flex items-center justify-center shrink-0">3</span>
                      <span>Pégalas en las variables de entorno de AI Studio (VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY).</span>
                    </li>
                  </ol>
                  <div className="mt-6 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <p className="text-[10px] text-amber-700 font-black uppercase tracking-widest mb-1">⚠️ Importante</p>
                    <p className="text-[10px] text-amber-600 font-bold leading-tight">
                      Sin esto, las fotos y audios que subas en el taller no aparecerán en el móvil del cliente.
                    </p>
                  </div>
                </div>
              )}

              <div className="mt-8 pt-8 border-t border-white/10 -mx-8 px-8 pb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-500 p-2 rounded-lg text-white">
                    <SettingsIcon size={20} />
                  </div>
                  <h3 className="text-xl font-black text-white uppercase tracking-tight">URL Pública del Taller</h3>
                </div>
                
                <p className="text-sm text-slate-400 font-bold mb-4 leading-tight">
                  ⚠️ ESTE PASO ES OBLIGATORIO PARA QUE FUNCIONE EL MÓVIL DEL CLIENTE:
                </p>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1">Pega aquí la "Shared App URL" de AI Studio</label>
                    <input 
                      type="text"
                      className="w-full bg-[#0B132B] border border-white/20 rounded-2xl py-5 px-6 text-sm font-black text-blue-300 focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-600"
                      value={publicUrl}
                      onChange={(e) => {
                        setPublicUrl(e.target.value);
                        localStorage.setItem('tallerlive_public_url', e.target.value);
                      }}
                      placeholder="https://ais-pre-..."
                    />
                  </div>
                  
                  <div className="p-4 bg-[#0B132B] border border-white/10 rounded-2xl">
                    <p className="text-[11px] text-slate-400 font-medium leading-snug">
                      1. Ve a la pestaña <b>Integrations</b> de AI Studio (arriba).<br/>
                      2. Copia la <b>Shared App URL</b> (la que empieza por <b>ais-pre-</b>).<br/>
                      3. Pégala en el cuadro azul de arriba.
                    </p>
                  </div>

                  {publicUrl.includes('-dev-') && (
                    <div className="p-4 bg-red-50 border-2 border-red-200 rounded-2xl animate-pulse">
                      <p className="text-[10px] font-black text-red-600 uppercase mb-1">❌ ERROR DE CONFIGURACIÓN</p>
                      <p className="text-[11px] text-red-700 font-bold">
                        Estás usando la URL de desarrollo. Los clientes verán "Página no encontrada". 
                        Debes usar la URL que empieza por <b>ais-pre-</b>.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-[#050A1F] rounded-[32px] p-8 shadow-xl text-white">
              <h3 className="text-lg font-black uppercase tracking-tight mb-2">Sobre TallerLive</h3>
              <p className="text-blue-400 text-xs font-bold mb-6">Versión 1.2.0 - Automoción Mendoza</p>
              <button 
                onClick={() => window.location.reload()}
                className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-white/10"
              >
                Reiniciar Aplicación
              </button>
            </div>
          </motion.div>
        )}

        {activeTab === 'clientes' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xl font-black text-white uppercase tracking-tight">Gestión de Clientes</h3>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-200"
              >
                <Plus size={16} /> Nuevo Cliente
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customers.map(customer => (
                <div key={customer.id} className="bg-[#131D3B] rounded-3xl p-6 border border-white/10 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-900/40 rounded-2xl flex items-center justify-center text-blue-400">
                        <FileText size={24} />
                      </div>
                      <div>
                        <h4 className="font-black text-white uppercase tracking-tight">{customer.name}</h4>
                        <p className="text-xs text-slate-400 font-bold">{customer.phone}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="p-2 text-slate-600 hover:text-blue-400 transition-colors"
                        onClick={async () => {
                          const newName = window.prompt('Nombre del cliente:', customer.name);
                          if (newName === null) return;
                          const newPhone = window.prompt('Teléfono:', customer.phone);
                          if (newPhone === null) return;

                          console.log("UPDATE CUSTOMER TRIGGERED", customer.id);

                          setCustomers(prev => prev.map(c =>
                            c.id === customer.id ? { ...c, name: newName, phone: newPhone } : c
                          ));

                          if (isSupabaseConnected) {
                            const { error } = await supabase
                              .from('customers')
                              .update({
                                name: newName,
                                phone: newPhone,
                                workshop_id: CURRENT_WORKSHOP_ID
                              })
                              .eq('id', customer.id);
                            if (error) console.error("ERROR UPDATE CUSTOMER:", error);
                          }
                        }}
                      >
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={async () => {
                          if (confirm('¿Eliminar cliente y todos sus vehículos/órdenes?')) {
                            await supabase.from('customers').delete().eq('id', customer.id);
                            setCustomers(prev => prev.filter(c => c.id !== customer.id));
                          }
                        }}
                        className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Vehículos</p>
                    <div className="flex flex-wrap gap-2">
                      {vehicles.filter(v => v.customer_id === customer.id).map(vehicle => (
                        <div key={vehicle.id} className="bg-[#0B132B] border border-white/10 px-3 py-2 rounded-xl flex items-center gap-2">
                          <span className="text-[10px] font-black text-white">{vehicle.plate}</span>
                          <span className="text-[10px] font-bold text-slate-400">{vehicle.model}</span>
                        </div>
                      ))}
                      <button className="bg-blue-900/30 text-blue-400 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-500/20 hover:bg-blue-900/50 transition-colors">
                        + Añadir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {customers.length === 0 && (
              <div className="text-center py-20 bg-[#131D3B] rounded-[32px] border-2 border-dashed border-white/10">
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">No hay clientes registrados</p>
              </div>
            )}
          </motion.div>
        )}

        {activeTab === 'historial' && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-6"
          >
            <div className="bg-[#131D3B] rounded-[40px] p-12 text-center border border-white/10">
              <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6">
                <History size={40} className="text-slate-300" />
              </div>
              <h3 className="text-xl font-black text-white uppercase mb-2">Historial de Trabajos</h3>
              <p className="text-slate-400 font-medium">Próximamente podrás consultar todos los trabajos finalizados aquí.</p>
            </div>
          </motion.div>
        )}
      </main>

        {/* MODAL: CONFIRMACIÓN ELIMINAR */}
        <AnimatePresence>
          {deleteConfirmId && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#131D3B] rounded-[32px] p-8 max-w-sm w-full shadow-2xl border border-white/10 text-center"
              >
                <div className="w-20 h-20 bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 size={40} className="text-red-500" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2">¿Eliminar registro?</h3>
                <p className="text-slate-400 font-bold mb-8">Esta acción no se puede deshacer y borrará todos los datos del vehículo.</p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 py-4 bg-white/10 text-slate-300 rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 transition-all"
                  >
                    No, volver
                  </button>
                  <button 
                    onClick={() => {
                      handleDeleteJob(deleteConfirmId);
                      setDeleteConfirmId(null);
                    }}
                    className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-red-700 shadow-lg shadow-red-200 transition-all"
                  >
                    Sí, eliminar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MODAL: EDITAR ENTRADA */}
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-lg bg-[#131D3B] rounded-t-[40px] sm:rounded-[40px] shadow-2xl border border-white/10 overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-2xl font-black text-white uppercase tracking-tight">Editar Registro</h2>
                    <p className="text-slate-400 text-sm font-bold">Modifica los datos del vehículo o cliente</p>
                  </div>
                  <button
                    onClick={() => setIsEditModalOpen(false)}
                    className="p-2 bg-white/10 rounded-full text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleUpdateJob} className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Matrícula</label>
                      <input 
                        required
                        placeholder="1234-ABC"
                        className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all uppercase"
                        value={formData.plate}
                        onChange={(e) => setFormData({...formData, plate: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Modelo</label>
                      <input 
                        required
                        placeholder="Seat Leon"
                        className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
                        value={formData.model}
                        onChange={(e) => setFormData({...formData, model: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Nombre Cliente</label>
                    <input 
                      required
                      placeholder="Juan Pérez"
                      className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
                      value={formData.customerName}
                      onChange={(e) => setFormData({...formData, customerName: e.target.value})}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Móvil WhatsApp</label>
                      <input 
                        required
                        type="tel"
                        placeholder="600 000 000"
                        className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
                        value={formData.customerPhone}
                        onChange={(e) => setFormData({...formData, customerPhone: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo Entrada</label>
                    <textarea 
                      required
                      placeholder="Ej: Revisión anual, ruidos en frenos..."
                      className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-sm font-medium focus:border-blue-500 focus:outline-none transition-all min-h-[100px]"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Urgencia</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['low', 'medium', 'high'] as const).map((u) => (
                        <button
                          key={u}
                          type="button"
                          onClick={() => setFormData({ ...formData, urgency: u })}
                          className={cn(
                            "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all",
                            formData.urgency === u 
                              ? (u === 'high' ? "bg-red-50 border-red-500 text-red-600" : u === 'medium' ? "bg-blue-50 border-blue-500 text-blue-600" : "bg-slate-50 border-slate-500 text-slate-600")
                              : "bg-white border-slate-100 text-slate-400 hover:border-slate-200"
                          )}
                        >
                          {u === 'low' ? 'Baja' : u === 'medium' ? 'Media' : 'Alta'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="flex-1 py-4 bg-white/10 text-slate-300 rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 shadow-lg shadow-blue-200 transition-all"
                    >
                      Guardar Cambios
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: NUEVA ENTRADA */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              className="relative w-full max-w-lg bg-white rounded-t-[40px] sm:rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-8 overflow-y-auto max-h-[92vh]">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Nueva Entrada</h2>
                    <p className="text-slate-500 text-sm font-bold">Registro rápido de vehículo</p>
                  </div>
                  <button 
                    onClick={() => setIsModalOpen(false)}
                    className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <form onSubmit={handleCreateJob} className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cliente</label>
                    <div className="relative">
                      <input 
                        placeholder="Buscar o escribir nuevo cliente..."
                        className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
                        value={formData.customerName}
                        onChange={(e) => {
                          setFormData({...formData, customerName: e.target.value});
                          setSelectedCustomerId(null);
                        }}
                      />
                      {formData.customerName && !selectedCustomerId && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl max-h-40 overflow-y-auto">
                          {customers.filter(c => c.name.toLowerCase().includes(formData.customerName.toLowerCase())).map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                setFormData({
                                  ...formData,
                                  customerName: c.name,
                                  customerPhone: c.phone
                                });
                                setSelectedCustomerId(c.id);
                              }}
                              className="w-full text-left px-5 py-3 hover:bg-slate-50 font-bold text-sm border-b border-slate-100 last:border-0"
                            >
                              {c.name} ({c.phone})
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Móvil WhatsApp</label>
                      <input 
                        required
                        type="tel"
                        placeholder="600 000 000"
                        className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
                        value={formData.customerPhone}
                        onChange={(e) => setFormData({...formData, customerPhone: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Matrícula</label>
                      <input 
                        required
                        placeholder="1234-ABC"
                        className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all uppercase"
                        value={formData.plate}
                        onChange={(e) => setFormData({...formData, plate: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Modelo</label>
                      <input 
                        required
                        placeholder="Seat Leon"
                        className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
                        value={formData.model}
                        onChange={(e) => setFormData({...formData, model: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo Entrada</label>
                    <textarea 
                      placeholder="Descripción breve de la avería..."
                      className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-base font-bold focus:border-blue-500 focus:outline-none transition-all min-h-[100px]"
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Gravedad / Tipo de Trabajo</label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { id: 'low', label: 'Mantenimiento', desc: 'Revisiones, aceite, filtros...', color: 'bg-emerald-500', borderColor: 'border-emerald-500', bgColor: 'bg-emerald-50' },
                        { id: 'medium', label: 'Desgaste / Avería', desc: 'Frenos, piezas, no crítico...', color: 'bg-amber-500', borderColor: 'border-amber-500', bgColor: 'bg-amber-50' },
                        { id: 'high', label: 'Crítico / Accidente', desc: 'Seguridad, golpe grave...', color: 'bg-red-500', borderColor: 'border-red-500', bgColor: 'bg-red-50' }
                      ].map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => setFormData({...formData, urgency: u.id as any})}
                          className={cn(
                            "flex flex-col items-center p-3 rounded-2xl border-2 transition-all text-center",
                            formData.urgency === u.id 
                              ? `${u.borderColor} ${u.bgColor}` 
                              : "border-slate-100 bg-slate-50 opacity-60"
                          )}
                        >
                          <div className={cn("w-3 h-3 rounded-full mb-2", u.color)} />
                          <span className="text-[9px] font-black uppercase mb-1 leading-none">{u.label}</span>
                          <span className="text-[7px] font-bold text-slate-400 leading-tight">{u.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button 
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="flex-1 py-5 rounded-3xl text-slate-500 font-black uppercase text-sm border-2 border-slate-100 hover:bg-slate-50 transition-all"
                    >
                      Cancelar
                    </button>
                    <button 
                      type="submit"
                      disabled={isLoading}
                      className="flex-[2] py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                    >
                      {isLoading ? 'Guardando...' : 'Registrar Entrada'}
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: PRESUPUESTO */}
      <AnimatePresence>
        {isBudgetModalOpen && (() => {
          const activeJob = jobs.find(j => j.id === activeJobId);
          return (
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsBudgetModalOpen(false)}
                className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
              />
              <motion.div 
                initial={{ y: "100%" }}
                animate={{ y: 0 }}
                exit={{ y: "100%" }}
                className="relative w-full max-w-md bg-white rounded-t-[40px] sm:rounded-[40px] shadow-2xl max-h-[92dvh] overflow-hidden flex flex-col"
              >
                <div className="p-8 overflow-y-auto flex-1">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Presupuestar</h2>
                    <button onClick={() => setIsBudgetModalOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
                  </div>
                  
                  <div className="space-y-6">
                    {/* Previsualización del Informe */}
                    {activeJob && (
                      <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 space-y-4">
                        {/* Fotos */}
                        {activeJob.photos?.length > 0 && (
                          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                            {activeJob.photos.map((url: string, i: number) => (
                              <img
                                key={i}
                                src={url}
                                alt={`Foto ${i + 1}`}
                                className="w-24 h-24 rounded-2xl object-cover border-2 border-white shadow-md shrink-0 cursor-pointer"
                                onClick={() => window.open(url, '_blank')}
                              />
                            ))}
                          </div>
                        )}
                        {/* Audios */}
                        {activeJob.audios?.length > 0 && (
                          <div className="space-y-2">
                            {activeJob.audios.map((url: string, i: number) => (
                              <div key={i} className="flex items-center gap-3 bg-white p-3 rounded-2xl border border-slate-100">
                                <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 shrink-0">
                                  <Mic size={14} />
                                </div>
                                <audio controls src={url} className="flex-1 h-8" />
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Diagnóstico editable */}
                        <div className="bg-white p-4 rounded-2xl border border-slate-100">
                          <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Diagnóstico Técnico</p>
                          <textarea
                            className="w-full text-sm font-bold text-slate-700 italic leading-relaxed bg-transparent resize-none focus:outline-none focus:ring-2 focus:ring-blue-300 rounded-lg p-1 min-h-[120px]"
                            value={diagnosisText}
                            onChange={(e) => setDiagnosisText(e.target.value)}
                            placeholder="Sin diagnóstico procesado"
                          />
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Importe Total (€)</label>
                      <input
                        type="number"
                        placeholder="Ej: 450"
                        className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-5 px-6 text-3xl font-black focus:border-blue-500 focus:outline-none transition-all"
                        value={budgetAmount}
                        onChange={(e) => setBudgetAmount(e.target.value)}
                        autoFocus
                      />
                    </div>

                    <button
                      onClick={handleSaveBudget}
                      className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
                    >
                      Guardar informe
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Botón Flotante: Nueva Entrada */}
      <button 
        onClick={() => {
          setFormData({ plate: '', model: '', customerName: '', customerPhone: '', description: '', urgency: 'medium' });
          setIsModalOpen(true);
        }}
        className="fixed bottom-[68px] right-5 w-11 h-11 text-white rounded-full flex items-center justify-center active:scale-90 transition-all z-50"
        style={{ background: 'linear-gradient(145deg, #3a4060, #1e2030)', boxShadow: '0 4px 16px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1)' }}
      >
        <Plus size={24} />
      </button>

      {/* Navegación Inferior */}
      <nav className="fixed bottom-0 inset-x-0 bg-[#14151F]/98 backdrop-blur-lg border-t border-white/[0.08] h-[60px] flex items-center justify-around px-8 z-40">
        <NavItem icon={<Wrench size={20} />} label="Taller" active={activeTab === 'taller'} onClick={() => setActiveTab('taller')} />
        <NavItem icon={<Clock size={20} />} label="Historial" active={activeTab === 'historial'} onClick={() => setActiveTab('historial')} />
        <NavItem icon={<Phone size={20} />} label="Clientes" active={activeTab === 'clientes'} onClick={() => setActiveTab('clientes')} />
        <NavItem icon={<SettingsIcon size={20} />} label="Ajustes" active={activeTab === 'ajustes'} onClick={() => setActiveTab('ajustes')} />
      </nav>
    </div>
  );
}

// --- Sub-componentes ---

function StatCard({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="stone-card rounded-xl p-3 text-center shadow-md">
      <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-0.5">{label}</p>
      <p className={cn("text-3xl font-black leading-none", color)}>{value}</p>
    </div>
  );
}

function ActionButton({ icon, label, className, disabled = false, onClick }: { icon: React.ReactNode, label: string, className?: string, disabled?: boolean, onClick?: () => void }) {
  return (
    <button 
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "w-full h-20 flex flex-col items-center justify-center gap-1 rounded-[2rem] text-[11px] font-black uppercase border-2 transition-all active:scale-95 shadow-lg",
        disabled ? "opacity-30 grayscale cursor-not-allowed" : "hover:shadow-xl hover:-translate-y-0.5",
        className
      )}
    >
      <div className="scale-110">{icon}</div>
      <span className="tracking-tighter leading-none mt-1">{label}</span>
    </button>
  );
}

function StepIndicator({ active, icon, label, completed }: { active: boolean, icon: React.ReactNode, label: string, completed: boolean }) {
  return (
    <div className={cn(
      "flex flex-col items-center gap-1.5 transition-all",
      active || completed ? "opacity-100" : "opacity-30 grayscale"
    )}>
      <div className={cn(
        "w-11 h-11 rounded-2xl flex items-center justify-center border-2 transition-all duration-500",
        completed ? "bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-100" : 
        active ? "bg-blue-600 border-blue-700 text-white shadow-lg shadow-blue-100 scale-110" : 
        "bg-white border-slate-200 text-slate-400"
      )}>
        {completed ? <Check size={22} strokeWidth={4} /> : icon}
      </div>
      <span className={cn(
        "text-[9px] font-black uppercase tracking-widest",
        completed ? "text-emerald-500" : active ? "text-blue-600" : "text-slate-400"
      )}>{label}</span>
    </div>
  );
}

function NavItem({ icon, label, active = false, onClick }: { icon: React.ReactNode, label: string, active?: boolean, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 transition-colors",
        active ? "text-blue-400" : "text-slate-500 hover:text-slate-300"
      )}
    >
      {icon}
      <span className="text-[9px] font-black uppercase tracking-tighter">{label}</span>
    </button>
  );
}


