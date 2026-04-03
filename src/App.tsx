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
  Terminal,
  History
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, generateUUID } from './lib/utils';
import { supabase, type Order, type Vehicle, type Customer } from './lib/supabase';
import { transcribeAndDiagnose, isGeminiConfigured } from './services/geminiService';
import { AudioRecorder } from './services/audioService';
import { compressImage } from './services/imageService';
import { mapOrderToJob } from './lib/mapOrderToJob';
import { can, ACTIONS } from './lib/permissions';
import type { Job, JobStatus, Urgency } from './types';
import { UrgencyBadge } from './components/UrgencyBadge';
import { StatusBadge } from './components/StatusBadge';
import { WorkflowTracker, getNextAction } from './components/WorkflowTracker';
import { LoginScreen } from './screens/LoginScreen';
import { ResetPasswordScreen } from './screens/ResetPasswordScreen';
import { ClientView } from './views/ClientView';

// (tipos movidos a src/types.ts)

// --- Constantes de configuración ---
const CURRENT_WORKSHOP_ID = import.meta.env.VITE_WORKSHOP_ID || '';
const WORKSHOP_NAME = import.meta.env.VITE_WORKSHOP_NAME || 'Taller';
const WORKSHOP_CITY = import.meta.env.VITE_WORKSHOP_CITY || '';

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

// (UrgencyBadge, StatusBadge, WorkflowTracker, getNextAction movidos a src/components/)
// (generateUUID movido a src/lib/utils.ts)
// (compressImage movido a src/services/imageService.ts)
// (mapOrderToJob movido a src/lib/mapOrderToJob.ts)

// (LoginScreen y ResetPasswordScreen movidos a src/screens/)

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
  const [jobs, setJobs] = useState<Job[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [filter, setFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBudgetModalOpen, setIsBudgetModalOpen] = useState(false);
  const [isSavingBudget, setIsSavingBudget] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [budgetAmount, setBudgetAmount] = useState<string>('');
  const [diagnosisText, setDiagnosisText] = useState<string>('');
  const [viewMode, setViewMode] = useState<'taller' | 'client'>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('orderId') || params.get('t')) ? 'client' : 'taller';
  });
  const [clientJob, setClientJob] = useState<Job | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [publicUrl, setPublicUrl] = useState<string>(() => {
    return localStorage.getItem('tallerlive_public_url') || '';
  });
  const [isApproved, setIsApproved] = useState(false);
  const [justApproved, setJustApproved] = useState(false); // true solo cuando el cliente aprueba en esta sesión
  const [activeTab, setActiveTab] = useState<'taller' | 'historial' | 'clientes' | 'ajustes'>('taller');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [deliverConfirmId, setDeliverConfirmId] = useState<string | null>(null);
  const [addVehicleCustomerId, setAddVehicleCustomerId] = useState<string | null>(null);
  const [newVehiclePlate, setNewVehiclePlate] = useState('');
  const [newVehicleModel, setNewVehicleModel] = useState('');
  const [deleteVehicleId, setDeleteVehicleId] = useState<string | null>(null);
  const [isClientLoading, setIsClientLoading] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return !!(params.get('orderId') || params.get('t'));
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
  const [editingJob, setEditingJob] = useState<Job | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  const [vehicleSearch, setVehicleSearch] = useState('');

  // Auth & workshop dinámico
  const [user, setUser] = useState<any>(null);
  const [workshopId, setWorkshopId] = useState<string>('');
  const [workshopInfo, setWorkshopInfo] = useState<{ name: string; city: string } | null>(null);
  const [userRole, setUserRole] = useState<string>('');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [allWorkshops, setAllWorkshops] = useState<{ id: string; name: string }[]>([]);
  const [authLoading, setAuthLoading] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);

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
    if (!isSupabaseConnected || !workshopId) return [];
    try {
      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          vehicle:vehicles(*),
          customer:customers(*),
          media:order_media(*)
        `)
        .eq('workshop_id', workshopId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('[fetchJobsFromSupabase] Error de Supabase:', error);
        addLog(`[fetchJobs] ERROR: ${error.message} (code: ${error.code})`);
        return [];
      }

      if (!data || data.length === 0) return [];

      return data.map(mapOrderToJob);
    } catch (e: any) {
      console.error('[fetchJobsFromSupabase] Excepción inesperada:', e);
      addLog(`[fetchJobs] EXCEPCIÓN: ${e?.message ?? e}`);
      return [];
    }
  }, [isSupabaseConnected, workshopId]);

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
  const recordingJobIdRef = React.useRef<string | null>(null);
  const budgetJobIdRef = React.useRef<string | null>(null);
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

  // --- Auth: detectar usuario y asignar workshopId desde profiles ---
  useEffect(() => {
    if (!isSupabaseConnected) {
      setAuthLoading(false);
      return;
    }

    const loadUserAndWorkshop = async (authUser: any) => {
      if (!authUser) {
        setUser(null);
        setUserRole('');
        setWorkshopId('');
        setWorkshopInfo(null);
        setIsSuperAdmin(false);
        setAllWorkshops([]);
        setJobs([]);
        setCustomers([]);
        setVehicles([]);
        setAuthLoading(false);
        return;
      }

      setUser(authUser);

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('workshop_id, role')
        .eq('id', authUser.id)
        .single();

      if (profileError) {
        console.error('[profiles] Error al leer profiles para uid', authUser.id, profileError);
        addLog(`[profiles] ERROR: ${profileError.message} (code: ${profileError.code}) uid=${authUser.id}`);
        setAuthLoading(false);
        return;
      }

      if (!profile) {
        console.warn('[profiles] No se encontró fila en profiles para uid:', authUser.id);
        addLog(`[profiles] SIN FILA: no existe profiles row para uid=${authUser.id}`);
        setAuthLoading(false);
        return;
      }

      setUserRole(profile.role ?? '');

      if (profile.role === 'super_admin') {
        // super_admin: cargar lista de talleres y elegir uno activo inicial
        setIsSuperAdmin(true);
        const { data: workshops } = await supabase.from('workshops').select('id, name');
        if (workshops && workshops.length > 0) {
          setAllWorkshops(workshops);
          // Taller activo inicial: el del propio perfil si existe, si no el primero de la lista
          const initialId = profile.workshop_id || workshops[0].id;
          setWorkshopId(initialId);
        } else {
          setAllWorkshops([]);
          setWorkshopId(profile.workshop_id || '');
        }
      } else {
        // usuario normal: siempre su propio taller fijo, nunca cambia
        setWorkshopId(profile.workshop_id || '');
      }

      setAuthLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      const isRecoveryFlow =
        event === 'PASSWORD_RECOVERY' ||
        (event === 'SIGNED_IN' && window.location.hash.includes('type=recovery'));

      if (isRecoveryFlow) {
        setIsRecovery(true);
        setAuthLoading(false);
        return;
      }
      loadUserAndWorkshop(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, [isSupabaseConnected]);

  // --- Recargar jobs del taller cuando workshopId cambie ---
  useEffect(() => {
    if (!isSupabaseConnected || !workshopId) return;
    setJobs([]);
    fetchJobsFromSupabase().then(fresh => {
      setJobs(fresh);
    });
  }, [workshopId, fetchJobsFromSupabase, isSupabaseConnected]);

  // --- Cargar nombre y ciudad del taller desde BD ---
  useEffect(() => {
    if (!workshopId || !isSupabaseConnected) {
      setWorkshopInfo(null);
      return;
    }
    supabase
      .from('workshops')
      .select('name, city')
      .eq('id', workshopId)
      .single()
      .then(({ data, error }) => {
        if (error) {
          console.error('[workshops] Error al leer workshops para id', workshopId, error);
          addLog(`[workshops] ERROR: ${error.message} (code: ${error.code}) workshopId=${workshopId}`);
          return;
        }
        if (!data) {
          console.warn('[workshops] No se encontró workshop con id:', workshopId);
          addLog(`[workshops] SIN FILA: no existe workshops row para workshopId=${workshopId}`);
          return;
        }
        setWorkshopInfo({ name: data.name ?? '', city: (data as any).city ?? '' });
      });
  }, [workshopId, isSupabaseConnected]);

  // --- Cargar Clientes y Vehículos ---
  useEffect(() => {
    // Limpiar siempre al cambiar workshopId o tab para evitar estado engañoso
    setCustomers([]);
    setVehicles([]);
    if (activeTab === 'clientes' && isSupabaseConnected && workshopId) {
      const fetchCustomersAndVehicles = async () => {
        const { data: customersData, error: errC } = await supabase.from('customers').select('*').eq('workshop_id', workshopId).order('name');
        const { data: vehiclesData, error: errV } = await supabase.from('vehicles').select('*').eq('workshop_id', workshopId).order('plate');

        if (errC) {
          console.error('[clientes] Error al cargar customers:', errC);
          addLog(`[clientes] ERROR customers: ${errC.message} (code: ${errC.code})`);
          setCustomers([]);
        } else {
          setCustomers(customersData ?? []);
        }

        if (errV) {
          console.error('[clientes] Error al cargar vehicles:', errV);
          addLog(`[clientes] ERROR vehicles: ${errV.message} (code: ${errV.code})`);
          setVehicles([]);
        } else {
          setVehicles(vehiclesData ?? []);
        }
      };
      fetchCustomersAndVehicles();
    }
  }, [activeTab, isSupabaseConnected, workshopId]);

  // --- Persistencia: YA NO usamos localStorage para jobs ---
  // Supabase es la única fuente de verdad.
  // Solo guardamos para offline fallback básico (sin media).
  useEffect(() => {
    if (jobs.length > 0) {
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
    if (!isSupabaseConnected || !workshopId) return;

    const channel = supabase
      .channel(`orders-realtime-${workshopId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `workshop_id=eq.${workshopId}`
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
                const qv = updatedOrder.quote_version ?? 1;
                const aqv = updatedOrder.approved_quote_version ?? null;
                const isNowApproved = aqv !== null && aqv >= qv;

                if (isNowApproved) setIsApproved(true);

                return {
                  ...prev,
                  status: updatedOrder.status,
                  budget: updatedOrder.budget,
                  aiDiagnosis: updatedOrder.description,
                  quote_version: qv,
                  approved_quote_version: aqv,
                  approved_at: updatedOrder.approved_at ?? null,
                  is_accepted: updatedOrder.is_accepted ?? false,
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
  }, [isSupabaseConnected, refreshSingleJob, workshopId]);

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
            .rpc('get_order_by_token', { p_token: tokenParam });

          if (data) {
            const qv = data.quote_version ?? 1;
            const aqv = data.approved_quote_version ?? null;
            const fetchedJob = {
              id: data.id,
              plate: data.vehicle?.plate,
              model: data.vehicle?.model,
              customer: data.customer?.name,
              customerPhone: '',
              status: data.status,
              budget: data.budget?.toString() || '0',
              aiDiagnosis: data.description,
              budgetShared: !!data.budget,
              description: data.description,
              public_token: data.public_token,
              is_accepted: data.is_accepted ?? false,
              quote_version: qv,
              approved_quote_version: aqv,
              approved_at: data.approved_at ?? null,
              entryTime: new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              photos: data.media?.filter((m: any) => m.media_type === 'image').map((m: any) => m.file_url) || [],
              audios: data.media?.filter((m: any) => m.media_type === 'audio').map((m: any) => m.file_url) || []
            };
            setClientJob(fetchedJob);
            // Aprobado si la versión aprobada coincide con la versión actual
            setIsApproved(aqv !== null && aqv >= qv);
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
          let job: Job = {
            id: decodedData.id,
            plate: decodedData.p ?? '',
            model: decodedData.m ?? '',
            customer: decodedData.c ?? '',
            customerPhone: '',
            budget: decodedData.b ?? '0',
            description: decodedData.d ?? '',
            status: (decodedData.s as JobStatus) ?? 'waiting',
            aiDiagnosis: decodedData.ai || '',
            budgetShared: false,
            public_token: null,
            is_accepted: false,
            quote_version: 1,
            approved_quote_version: null,
            approved_at: null,
            entryTime: 'Hoy',
            photos: decodedData.ph || [],
            audios: [],
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
                  budget: data.budget?.toString() || job.budget
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
              const fetchedJob: Job = {
                id: data.id,
                plate: data.vehicle?.plate ?? '',
                model: data.vehicle?.model ?? '',
                customer: data.customer?.name ?? '',
                customerPhone: data.customer?.phone ?? '',
                status: data.status,
                budget: data.budget?.toString() || '0',
                aiDiagnosis: data.description,
                budgetShared: data.status === 'waiting_customer' || data.status === 'repairing' || data.status === 'ready',
                description: data.description,
                public_token: data.public_token ?? null,
                is_accepted: data.is_accepted ?? false,
                quote_version: data.quote_version ?? 1,
                approved_quote_version: data.approved_quote_version ?? null,
                approved_at: data.approved_at ?? null,
                entryTime: new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                photos: data.media?.filter((m: any) => m.media_type === 'image').map((m: any) => m.file_url) || [],
                audios: data.media?.filter((m: any) => m.media_type === 'audio').map((m: any) => m.file_url) || [],
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

      // Los trabajos del taller se cargan en el useEffect que depende de workshopId
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
    if (!file) return;

    if (!activeJobId) {
      console.error("Foto sin activeJobId");
      notify("Error: no se pudo asociar la foto al pedido", 'error');
      return;
    }

    const jobId = activeJobId;
    console.log("Uploading photo for job:", jobId);


    addLog(`Iniciando subida de foto para job: ${jobId}`);

    // Marcar job como "subiendo" para feedback visual inmediato
    setJobs(prev => prev.map(j => String(j.id) === String(jobId) ? { ...j, _uploading: true } : j));

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

      // 4. CLAVE: Re-fetch este job desde Supabase (fuente de verdad)
      await refreshSingleJob(jobId);

      notify("Imagen subida correctamente", 'success');
    } catch (e: any) {
      console.error('Error subida foto:', e);
      addLog(`Error: ${e.message}`);
      notify(`Error al subir imagen: ${e.message}`, 'error');
    } finally {
      setJobs(prev => prev.map(j => String(j.id) === String(jobId) ? { ...j, _uploading: false } : j));
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

      recordingJobIdRef.current = jobId;
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

    const jobId = recordingJobIdRef.current;
    if (!jobId) return;

    try {
      const recorder = audioRecorderRef.current;
      const result = await recorder.stop();



      addLog(`Grabación: ${result.durationSeconds}s, ${(result.blob.size / 1024).toFixed(0)}KB`);

      if (result.durationSeconds < 2) {
        notify("Grabación demasiado corta. Graba al menos 2 segundos.", 'error');
        setActiveJobId(null);
        recordingJobIdRef.current = null;
        return;
      }

      // 1. Feedback inmediato: marcar como "procesando" (SIN guardar base64 en state)
      setJobs(prev => prev.map(j => String(j.id) === String(jobId) ? {
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
        setJobs(prev => prev.map(j => String(j.id) === String(jobId) ? { ...j, aiDiagnosis: professionalText } : j));
      } catch (err: any) {
        addLog(`Error IA: ${err.message}`);
        notify(`Error al transcribir: ${err.message}`, 'error');
        setJobs(prev => prev.map(j => String(j.id) === String(jobId) ? { ...j, aiDiagnosis: "Error al procesar diagnóstico." } : j));
        setActiveJobId(null);
        recordingJobIdRef.current = null;
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

          const currentJobForAudio = jobs.find(j => String(j.id) === String(jobId));
          const shouldAdvanceAudio = ['waiting', 'awaiting_diagnosis', 'diagnosing'].includes(currentJobForAudio?.status || '');
          await supabase.from('orders').update({
            description: professionalText,
            ...(shouldAdvanceAudio ? { status: 'diagnosing' } : {})
          }).eq('id', jobId);

          // 4. CLAVE: Re-fetch desde Supabase (fuente de verdad)
          await refreshSingleJob(jobId);

          notify("Audio procesado y guardado", 'success');
        } catch (err: any) {
          addLog(`Error Supabase: ${err.message}`);
          notify(`Error al guardar: ${err.message}`, 'error');
          setActiveJobId(null);
          recordingJobIdRef.current = null;
        }
      }

      setActiveJobId(null);
      recordingJobIdRef.current = null;
    } catch (err: any) {
      console.error("Error grabación:", err);
      addLog(`Error: ${err.message}`);
      notify("Error al procesar la grabación.", 'error');
      setActiveJobId(null);
      recordingJobIdRef.current = null;
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // --- Lógica de Presupuesto ---
  const openBudgetModal = (jobId: string) => {
    if (!can(userRole, ACTIONS.GENERATE_BUDGET)) return;
    budgetJobIdRef.current = jobId;
    setActiveJobId(jobId);
    const job = jobs.find(j => String(j.id) === String(jobId));
    setBudgetAmount(job?.budget || '0');
    setDiagnosisText(job?.aiDiagnosis || '');
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudget = async () => {
    if (!can(userRole, ACTIONS.EDIT_BUDGET)) return;
    if (isSavingBudget) return;

    const jobId = budgetJobIdRef.current;

    if (!jobId) {
      console.error("SaveBudget sin jobId");
      notify("Error: no se pudo guardar el informe", 'error');
      return;
    }

    setIsSavingBudget(true);

    const budgetToSave = budgetAmount || '0';
    const diagnosisToSave = diagnosisText;
    const currentJob = jobs.find(j => String(j.id) === String(jobId));
    const shouldAdvance = ['waiting', 'awaiting_diagnosis', 'diagnosing'].includes(currentJob?.status || '');
    // Si el precio cambia en un pedido ya enviado (y no está en 'ready'), incrementar quote_version
    const priceChanged = currentJob?.budgetShared && budgetToSave !== currentJob?.budget && currentJob?.status !== 'ready';
    const newQuoteVersion = priceChanged ? (currentJob?.quote_version ?? 1) + 1 : undefined;

    setJobs(prevJobs => prevJobs.map(job =>
      String(job.id) === String(jobId)
        ? { ...job, budget: budgetToSave, aiDiagnosis: diagnosisToSave, description: diagnosisToSave, ...(shouldAdvance ? { status: 'diagnosing' } : {}), ...(newQuoteVersion ? { quote_version: newQuoteVersion } : {}) }
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
            workshop_id: workshopId,
            ...(shouldAdvance ? { status: 'diagnosing' } : {}),
            ...(newQuoteVersion ? { quote_version: newQuoteVersion } : {})
          })
          .eq('id', jobId);
        if (error) throw error;
      } catch (e) {
        console.error('Error sincronizando presupuesto:', e);
        notify("Error al guardar el informe. Inténtalo de nuevo.", 'error');
        setIsSavingBudget(false);
        return;
      }
    }

    setIsSavingBudget(false);
    setIsBudgetModalOpen(false);
    setActiveJobId(null);
    budgetJobIdRef.current = null;
    setBudgetAmount('');
    setDiagnosisText('');
  };

  const handleWhatsAppShare = (job: any) => {
    if (!can(userRole, ACTIONS.SHARE_LINK)) return;
    if (!job.aiDiagnosis?.trim() || !job.budget || parseFloat(job.budget) <= 0) {
      alert("Debes completar el informe con texto y precio antes de enviarlo.");
      return;
    }

    const hasPendingRevision = (job.quote_version ?? 1) > 1 && (job.quote_version ?? 1) > (job.approved_quote_version ?? 0);

    if (!job.budgetShared) {
      // Primer envío: poner en waiting_customer
      setJobs(prev => prev.map(j => String(j.id) === String(job.id) ? { ...j, budgetShared: true, status: 'waiting_customer' } : j));
      if (isSupabaseConnected) {
        supabase.from('orders').update({ status: 'waiting_customer' }).eq('id', job.id).then();
      }
    } else if (hasPendingRevision && job.status === 'repairing') {
      // Revisión con precio cambiado desde repairing: volver a waiting_customer
      setJobs(prev => prev.map(j => String(j.id) === String(job.id) ? { ...j, status: 'waiting_customer', is_accepted: false } : j));
      if (isSupabaseConnected) {
        supabase.from('orders').update({ status: 'waiting_customer', is_accepted: false }).eq('id', job.id).then();
      }
    }
    // Casos sin cambio de estado: resend sin revisión, waiting_customer con revisión, ready

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

    const revisionPrefix = hasPendingRevision ? `⚠️ *PRESUPUESTO REVISADO (v${job.quote_version ?? 1})*\n\n` : '';
    const message = `*📋 INFORME DE TALLER - ${WORKSHOP_NAME.toUpperCase()}*\n\n` +
                    revisionPrefix +
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
    const message = `*✅ VEHÍCULO FINALIZADO - ${WORKSHOP_NAME.toUpperCase()}*\n\n` +
                    `Estimado/a *${job.customer}*,\n\n` +
                    `Le informamos que la reparación de su vehículo *${job.model}* (${job.plate}) ha sido completada.\n\n` +
                    `Su vehículo ya está listo y puede pasar a recogerlo por nuestras instalaciones cuando lo desee.\n\n` +
                    `Atentamente,\nEl equipo de ${WORKSHOP_NAME}.`;

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
          setJobs(fresh);
        }
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [viewMode, isSupabaseConnected, fetchJobsFromSupabase]);

  const handleDeliverJob = async (jobId: string) => {
    setJobs(prev => prev.map(j => String(j.id) === String(jobId) ? { ...j, status: 'delivered' } : j));
    if (isSupabaseConnected) {
      try {
        const { error } = await supabase.from('orders').update({ status: 'delivered' }).eq('id', jobId);
        if (error) throw error;
        notify('Vehículo marcado como entregado', 'success');
      } catch (e: any) {
        setJobs(prev => prev.map(j => String(j.id) === String(jobId) ? { ...j, status: 'ready' } : j));
        notify('Error al marcar como entregado', 'error');
      }
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!can(userRole, ACTIONS.DELETE_ORDER)) return;

    if (isSupabaseConnected) {
      try {
        const { error } = await supabase.from('orders').delete().eq('id', jobId);
        if (error) throw error;
        setJobs(prev => prev.filter(j => String(j.id) !== String(jobId)));
      } catch (e) {
        console.error('Error eliminando en Supabase:', e);
      }
    } else {
      setJobs(prev => prev.filter(j => String(j.id) !== String(jobId)));
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

        if (editingJob.vehicle_id) {
          await supabase.from('vehicles').update({
            plate: formData.plate.toUpperCase().trim(),
            model: formData.model.trim()
          }).eq('id', editingJob.vehicle_id);
        } else {
          console.warn('[handleUpdateJob] vehicle_id no disponible — plate/model no persistidos en BD');
        }
      } catch (e) {
        console.error('Error actualizando en Supabase:', e);
      }
    }
  };

  const handlePlateLookup = async (plate: string) => {
    const normalized = plate.toUpperCase().trim();
    if (normalized.length < 6) {
      setSelectedVehicleId(null);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('vehicles')
        .select('*, customer:customers(id, name, phone)')
        .eq('plate', normalized)
        .eq('workshop_id', workshopId)
        .maybeSingle();
      if (error) { console.warn('[handlePlateLookup] Error:', error.message); return; }
      if (data) {
        setSelectedVehicleId(data.id);
        setSelectedCustomerId(data.customer?.id ?? null);
        setFormData(prev => ({
          ...prev,
          plate: normalized,
          model: data.model ?? prev.model,
          customerName: data.customer?.name ?? prev.customerName,
          customerPhone: data.customer?.phone ?? prev.customerPhone,
        }));
      } else {
        setSelectedVehicleId(null);
      }
    } catch (e) {
      console.warn('[handlePlateLookup] Excepción:', e);
    }
  };

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    if (!workshopId) {
      console.error("ERROR: WORKSHOP_ID no configurado");
      notify("Error crítico: falta configuración del taller", 'error');
      setIsLoading(false);
      return;
    }

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
            .eq('workshop_id', workshopId)
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
                phone: formData.customerPhone,
                workshop_id: workshopId
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
            .eq('workshop_id', workshopId)
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
                customer_id: customerId,
                workshop_id: workshopId
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
            workshop_id: workshopId,
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
        const newJob: Job = {
          id: order.id,
          plate: formData.plate.toUpperCase(),
          model: formData.model,
          customer: formData.customerName,
          customerPhone: formData.customerPhone,
          status: 'waiting',
          urgency: formData.urgency,
          budget: '0',
          budgetShared: false,
          aiDiagnosis: formData.description,
          description: formData.description,
          public_token: order.public_token ?? null,
          is_accepted: false,
          quote_version: 1,
          approved_quote_version: null,
          approved_at: null,
          entryTime: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          photos: [],
          audios: [],
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
      notify("No se pudo crear el pedido. Comprueba la conexión e inténtalo de nuevo.", 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleApproveBudget = async () => {
    if (!clientJob || isApproved) return;
    if (!clientJob.public_token) return;

    // Sin Supabase: flujo demo/local sin garantías de servidor
    if (!isSupabaseConnected) {
      setIsApproved(true);
      setClientJob((prev: any) => ({ ...prev, status: 'repairing', is_accepted: true }));
      return;
    }

    // Con Supabase: operación atómica via RPC
    // No hay optimistic update — esperamos confirmación de BD antes de tocar UI
    try {
      const { data, error } = await supabase.rpc('approve_order_by_token', {
        p_token: clientJob.public_token,
      });

      if (error) {
        console.error('[handleApproveBudget] RPC error:', error);
        notify('Error al enviar la aprobación. Inténtalo de nuevo.', 'error');
        return;
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        // Token ya consumido o pedido fuera de estado waiting_customer
        notify('Este enlace ya fue usado o ya no está disponible.', 'info');
        return;
      }

      // BD confirmó la aprobación — marcar como "recién aprobado en esta sesión"
      setIsApproved(true);
      setJustApproved(true);
      setClientJob((prev: any) => ({
        ...prev,
        status: 'repairing',
        is_accepted: true,
        approved_quote_version: prev.quote_version ?? 1,
      }));
    } catch (e: any) {
      console.error('[handleApproveBudget] Excepción:', e);
      notify('Error de conexión. Inténtalo de nuevo.', 'error');
    }
  };

  if (viewMode === 'client') {
    return (
      <ClientView
        isLoading={isClientLoading}
        error={clientError}
        job={clientJob}
        justApproved={justApproved}
        isSupabaseConnected={isSupabaseConnected}
        workshopName={WORKSHOP_NAME}
        onApproveBudget={handleApproveBudget}
      />
    );
  }

  // --- Auth gating (solo para vista taller) ---
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#050A1F] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (isRecovery) {
    return <ResetPasswordScreen onDone={() => setIsRecovery(false)} />;
  }

  if (!user && isSupabaseConnected) {
    return <LoginScreen />;
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
            {isSuperAdmin ? (
              <select
                value={workshopId}
                onChange={(e) => setWorkshopId(e.target.value)}
                className="bg-white/10 border border-white/20 rounded-xl py-2 px-4 text-white font-bold text-sm mx-auto max-w-xs focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                {allWorkshops.map(w => (
                  <option key={w.id} value={w.id} className="bg-slate-900 text-white">{w.name}</option>
                ))}
              </select>
            ) : (
              <>
                <p className="text-xl font-bold uppercase text-white leading-none">{(workshopInfo?.name || WORKSHOP_NAME).toUpperCase()}</p>
                {(workshopInfo?.city || WORKSHOP_CITY) && <p className="text-sm text-blue-400 mt-1">{workshopInfo?.city || WORKSHOP_CITY}</p>}
              </>
            )}
          </div>

          {/* Derecha: Acciones */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={async () => {
                setIsLoading(true);
                const fresh = await fetchJobsFromSupabase();
                setJobs(fresh);
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
          </div>
        </div>

        {/* Fila 2+3: Empresa — solo móvil */}
        <div className="sm:hidden text-center mt-2 mb-2">
          {isSuperAdmin ? (
            <select
              value={workshopId}
              onChange={(e) => setWorkshopId(e.target.value)}
              className="bg-white/10 border border-white/20 rounded-xl py-2 px-4 text-white font-bold text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              {allWorkshops.map(w => (
                <option key={w.id} value={w.id} className="bg-slate-900 text-white">{w.name}</option>
              ))}
            </select>
          ) : (
            <>
              <p className="text-lg font-bold uppercase text-white leading-tight">{(workshopInfo?.name || WORKSHOP_NAME).toUpperCase()}</p>
              {(workshopInfo?.city || WORKSHOP_CITY) && <p className="text-xs text-blue-400 mt-1">{workshopInfo?.city || WORKSHOP_CITY}</p>}
            </>
          )}
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

      {/* DIAGNÓSTICO TEMPORAL — retirar tras validar roles */}
      <div className="mx-5 mt-3 px-4 py-2 bg-yellow-100 border border-yellow-300 rounded-xl text-xs font-mono text-yellow-900 space-y-0.5">
        <div>Email: {user?.email ?? '(vacío)'}</div>
        <div>Role: {userRole !== '' ? userRole : '(vacío)'}</div>
        <div>Workshop: {workshopId !== '' ? workshopId : '(vacío)'}</div>
      </div>

      {/* Estadísticas Rápidas - Más compactas */}
      <div className="px-5 mt-3 grid grid-cols-3 gap-3">
        <StatCard label="En Taller" value={jobs.length} color="text-blue-700" />
        <StatCard label="Pendientes" value={jobs.filter(j => ['waiting', 'diagnosed', 'waiting_customer', 'awaiting_diagnosis', 'diagnosing'].includes(j.status)).length} color="text-orange-600" />
        <StatCard label="Listos" value={jobs.filter(j => j.status === 'ready').length} color="text-[#2E6B40]" />
      </div>

      {/* Lista de Trabajos - Más densa y visual */}
      <main className="p-3 space-y-2.5">
        {activeTab === 'taller' && (
          <>
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Cola de Trabajo Activa</h2>
              <div className="flex items-center gap-1.5 text-blue-500 font-black text-xs uppercase cursor-pointer" onClick={() => setStatusFilter('all')}>
                <Filter size={14} />
                <span>Filtrar</span>
              </div>
            </div>

            {/* Chips de filtro por estado */}
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {[
                { key: 'all',        label: 'Todos' },
                { key: 'waiting',    label: 'En espera' },
                { key: 'diagnosed',  label: 'Diagnosticados' },
                { key: 'validation', label: 'Esp. cliente' },
                { key: 'repairing',  label: 'En reparación' },
                { key: 'ready',      label: 'Listos' },
              ].map(chip => (
                <button
                  key={chip.key}
                  onClick={() => setStatusFilter(chip.key)}
                  className={cn(
                    "shrink-0 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border transition-colors",
                    statusFilter === chip.key
                      ? "bg-blue-600 text-white border-blue-500"
                      : "bg-white/5 text-slate-400 border-white/10 hover:bg-white/10"
                  )}
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {(() => {
              const groups = [
                { key: 'waiting',    label: 'En espera',             statuses: ['waiting', 'awaiting_diagnosis'] },
                { key: 'diagnosed',  label: 'Diagnosticados',         statuses: ['diagnosed', 'diagnosing'] },
                { key: 'validation', label: 'En espera del cliente',  statuses: ['waiting_customer'] },
                { key: 'repairing',  label: 'En preparación',         statuses: ['repairing'] },
                { key: 'ready',      label: 'Listos para entrega',    statuses: ['ready'] },
              ];
              const activeGroups = statusFilter === 'all' ? groups : groups.filter(g => g.key === statusFilter);
              const textFiltered = jobs.filter(j =>
                j.status !== 'delivered' && (
                  (j.plate || '').toLowerCase().includes((filter || '').toLowerCase()) ||
                  (j.model || '').toLowerCase().includes((filter || '').toLowerCase()) ||
                  (j.customer || '').toLowerCase().includes((filter || '').toLowerCase())
                )
              );
              return (
                <AnimatePresence>
                  {activeGroups.flatMap(group => {
                    const groupJobs = textFiltered.filter(j => (group.statuses as string[]).includes(j.status));
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
                        {job.status === 'ready' && (
                          <button
                            onClick={() => setDeliverConfirmId(job.id)}
                            className="px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest bg-emerald-900/40 text-emerald-400 border border-emerald-700/40 hover:bg-emerald-800/50 transition-colors"
                            title="Marcar como entregado"
                          >
                            Entregado
                          </button>
                        )}
                        <button
                          onClick={() => handleEditJob(job)}
                          className="p-2 text-slate-600 hover:text-blue-400 transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        {can(userRole, ACTIONS.DELETE_ORDER) && (
                          <button
                            onClick={() => setDeleteConfirmId(job.id)}
                            className="p-2 text-slate-600 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
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
                      else if (step === 2 && can(userRole, ACTIONS.GENERATE_BUDGET)) openBudgetModal(job.id);
                      else if (step === 3 && can(userRole, ACTIONS.SHARE_LINK)) handleWhatsAppShare(job);
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
                    const ctaBlocked =
                      (next.action === 'budget' && !can(userRole, ACTIONS.GENERATE_BUDGET)) ||
                      (next.action === 'share' && !can(userRole, ACTIONS.SHARE_LINK));

                    if (ctaBlocked) return (
                      <div className="mt-2 w-full py-3 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 text-xs bg-slate-800 text-slate-500 border border-slate-700 cursor-default select-none">
                        Pendiente de administración
                      </div>
                    );

                    const handleCTA = () => {
                      if (next.action === 'budget') openBudgetModal(job.id);
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
                        className={cn(
                          "mt-2 w-full py-3 rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-2 text-base shadow-md border-b-4 active:border-b-0 active:translate-y-0.5 transition-all",
                          next.variant === 'green'
                            ? "bg-[#3FA37A] text-white border-[#2d7a5a]"
                            : "bg-blue-700 text-white/90 border-blue-900 hover:bg-blue-800 shadow-blue-100"
                        )}
                      >
                        <next.Icon size={16} />
                        {next.label}
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
            className="space-y-4"
          >
            {/* Diagnóstico de sesión — solo visible para super_admin */}
            {isSuperAdmin && (
            <div className="bg-[#0a0f2e] rounded-[32px] p-6 border border-yellow-500/30 space-y-3">
              <h3 className="text-xs font-black text-yellow-500 uppercase tracking-[0.2em]">Sesión activa</h3>
              <div className="space-y-2 font-mono text-xs">
                <div className="flex gap-2">
                  <span className="text-slate-500 w-28 shrink-0">Email</span>
                  <span className="text-white break-all">{user?.email ?? '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 w-28 shrink-0">User ID</span>
                  <span className="text-slate-300 break-all">{user?.id ?? '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 w-28 shrink-0">Workshop ID</span>
                  <span className="text-yellow-400 break-all">{workshopId || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 w-28 shrink-0">Taller (BD)</span>
                  <span className="text-emerald-400">{workshopInfo?.name || '—'}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-slate-500 w-28 shrink-0">Role</span>
                  <span className="text-blue-400">{userRole || '—'}</span>
                </div>
              </div>
            </div>
            )}

            {/* Información del taller */}
            <div className="bg-[#131D3B] rounded-[32px] p-8 border border-white/10 space-y-4">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em]">Taller</h3>
              <div>
                <p className="text-2xl font-black text-white tracking-tight">{workshopInfo?.name || WORKSHOP_NAME}</p>
                {(workshopInfo?.city || WORKSHOP_CITY) && <p className="text-sm text-slate-400 font-bold mt-1">{workshopInfo?.city || WORKSHOP_CITY}</p>}
              </div>
            </div>

            {/* Estado de conexión */}
            <div className="bg-[#131D3B] rounded-[32px] p-6 border border-white/10">
              <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-4">Estado del sistema</h3>
              <div className="flex items-center gap-4">
                <div className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center shrink-0",
                  isSupabaseConnected ? "bg-emerald-900/40 text-emerald-400" : "bg-red-900/40 text-red-400"
                )}>
                  <RefreshCw size={20} />
                </div>
                <div>
                  <p className="text-sm font-black text-white uppercase">
                    {isSupabaseConnected ? "Sincronización activa" : "Sin conexión"}
                  </p>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    {isSupabaseConnected
                      ? "Los datos se sincronizan en tiempo real."
                      : "Los datos se guardan solo en este dispositivo."}
                  </p>
                </div>
              </div>
            </div>

            {/* Sobre la app */}
            <div className="bg-[#050A1F] rounded-[32px] p-8 shadow-xl text-white space-y-6">
              <div>
                <h3 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Aplicación</h3>
                <p className="text-sm font-black text-white">TallerLive</p>
                <p className="text-xs text-slate-400 font-bold mt-1">Versión 1.2.0</p>
              </div>
              <button
                onClick={() => window.location.reload()}
                className="w-full py-4 bg-white/10 hover:bg-white/20 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-white/10"
              >
                Reiniciar Aplicación
              </button>
              {user && (
                <button
                  onClick={async () => {
                    localStorage.removeItem('tallerlive_jobs');
                    await supabase.auth.signOut();
                  }}
                  className="w-full py-4 bg-red-900/30 hover:bg-red-900/50 rounded-2xl text-xs font-black uppercase tracking-widest transition-all border border-red-500/20 text-red-400 mt-2"
                >
                  Cerrar Sesión
                </button>
              )}
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
                                workshop_id: workshopId
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
                          <button
                            onClick={() => setDeleteVehicleId(vehicle.id)}
                            className="ml-1 text-slate-600 hover:text-red-400 transition-colors"
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        onClick={() => {
                          setAddVehicleCustomerId(customer.id);
                          setNewVehiclePlate('');
                          setNewVehicleModel('');
                        }}
                        className="bg-blue-900/30 text-blue-400 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-500/20 hover:bg-blue-900/50 transition-colors"
                      >
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
            className="space-y-3"
          >
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-[0.2em] px-1">Trabajos Entregados</h2>
            {(() => {
              const delivered = jobs.filter(j => j.status === 'delivered').sort((a, b) => {
                return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
              });
              if (delivered.length === 0) return (
                <div className="bg-[#131D3B] rounded-[32px] p-12 text-center border border-white/10">
                  <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4">
                    <History size={32} className="text-slate-500" />
                  </div>
                  <p className="text-slate-400 font-bold text-sm">No hay trabajos entregados aún.</p>
                </div>
              );
              return delivered.map(job => (
                <div key={job.id} className="card-industrial rounded-[16px] px-4 py-3 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <StatusBadge status={job.status} />
                    <span className="text-[10px] text-slate-500 font-bold">
                      {job.created_at ? new Date(job.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' }) : job.entryTime}
                    </span>
                  </div>
                  <div>
                    <span className="text-xl font-black text-white tracking-tighter leading-none">{job.plate}</span>
                    <p className="text-sm text-slate-400 font-semibold mt-0.5">{job.model}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-slate-300 uppercase">{job.customer}</span>
                    {job.public_token && (
                      <button
                        onClick={() => {
                          const url = `${window.location.origin}${window.location.pathname}?t=${job.public_token}`;
                          window.open(url, '_blank');
                        }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-900/40 text-blue-400 text-[10px] font-black uppercase tracking-widest border border-blue-700/30 hover:bg-blue-800/50 transition-colors"
                      >
                        <FileText size={12} />
                        Ver informe
                      </button>
                    )}
                  </div>
                </div>
              ));
            })()}
          </motion.div>
        )}
      </main>

        {/* MODAL: AÑADIR VEHÍCULO */}
        <AnimatePresence>
          {addVehicleCustomerId && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#131D3B] rounded-[32px] p-8 max-w-sm w-full shadow-2xl border border-white/10"
              >
                <h3 className="text-xl font-black text-white mb-6 uppercase tracking-tight">Añadir Vehículo</h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Matrícula *</label>
                    <input
                      autoFocus
                      type="text"
                      placeholder="1234-ABC"
                      className="w-full bg-[#0B132B] border border-white/20 rounded-2xl py-4 px-5 text-lg font-black text-white focus:border-blue-500 focus:outline-none transition-all uppercase placeholder:text-slate-600"
                      value={newVehiclePlate}
                      onChange={e => setNewVehiclePlate(e.target.value.toUpperCase())}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Modelo</label>
                    <input
                      type="text"
                      placeholder="Seat León"
                      className="w-full bg-[#0B132B] border border-white/20 rounded-2xl py-4 px-5 text-sm font-bold text-white focus:border-blue-500 focus:outline-none transition-all placeholder:text-slate-600"
                      value={newVehicleModel}
                      onChange={e => setNewVehicleModel(e.target.value)}
                    />
                  </div>
                </div>
                <div className="flex gap-4 mt-8">
                  <button
                    onClick={() => setAddVehicleCustomerId(null)}
                    className="flex-1 py-4 bg-white/10 text-slate-300 rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    disabled={!newVehiclePlate.trim()}
                    onClick={async () => {
                      if (!newVehiclePlate.trim()) return;
                      const plate = newVehiclePlate.toUpperCase().trim();
                      const model = newVehicleModel.trim();
                      if (isSupabaseConnected) {
                        const { data, error } = await supabase
                          .from('vehicles')
                          .insert([{ plate, model, customer_id: addVehicleCustomerId, workshop_id: workshopId }])
                          .select()
                          .single();
                        if (!error && data) {
                          setVehicles(prev => [...prev, data]);
                        } else if (error) {
                          console.error('Error añadiendo vehículo:', error);
                          notify('Error al añadir vehículo', 'error');
                          return;
                        }
                      } else {
                        setVehicles(prev => [...prev, {
                          id: `temp-${Date.now()}`,
                          plate,
                          model,
                          customer_id: addVehicleCustomerId!,
                          created_at: new Date().toISOString()
                        }]);
                      }
                      setAddVehicleCustomerId(null);
                    }}
                    className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Guardar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MODAL: CONFIRMAR ELIMINAR VEHÍCULO */}
        <AnimatePresence>
          {deleteVehicleId && (
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
                <h3 className="text-2xl font-black text-white mb-2">¿Eliminar vehículo?</h3>
                <p className="text-slate-400 font-bold mb-8">El vehículo se eliminará del sistema. Los trabajos asociados no se verán afectados.</p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setDeleteVehicleId(null)}
                    className="flex-1 py-4 bg-white/10 text-slate-300 rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={async () => {
                      if (isSupabaseConnected) {
                        const { error } = await supabase.from('vehicles').delete().eq('id', deleteVehicleId);
                        if (error) {
                          console.error('Error eliminando vehículo:', error);
                          if (error.message?.includes('violates foreign key constraint')) {
                            notify('No puedes eliminar este vehículo porque tiene trabajos asociados', 'error');
                          } else {
                            notify('Error al eliminar vehículo', 'error');
                          }
                          setDeleteVehicleId(null);
                          return;
                        }
                      }
                      setVehicles(prev => prev.filter(v => v.id !== deleteVehicleId));
                      setDeleteVehicleId(null);
                    }}
                    className="flex-1 py-4 bg-red-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-red-700 transition-all"
                  >
                    Eliminar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

        {/* MODAL: CONFIRMACIÓN ENTREGADO */}
        <AnimatePresence>
          {deliverConfirmId && (
            <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                className="bg-[#131D3B] rounded-[32px] p-8 max-w-sm w-full shadow-2xl border border-white/10 text-center"
              >
                <div className="w-20 h-20 bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
                  <CheckCircle size={40} className="text-emerald-400" />
                </div>
                <h3 className="text-2xl font-black text-white mb-2">¿Vehículo entregado?</h3>
                <p className="text-slate-400 font-bold mb-8">¿Confirmas que el vehículo ha sido entregado al cliente?</p>
                <div className="flex gap-4">
                  <button
                    onClick={() => setDeliverConfirmId(null)}
                    className="flex-1 py-4 bg-white/10 text-slate-300 rounded-2xl font-black uppercase tracking-widest hover:bg-white/20 transition-all"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      handleDeliverJob(deliverConfirmId);
                      setDeliverConfirmId(null);
                    }}
                    className="flex-1 py-4 bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-900 transition-all"
                  >
                    Confirmar
                  </button>
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

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
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Matrícula</label>
                      <input
                        required
                        placeholder="1234-ABC"
                        className="w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all uppercase"
                        value={formData.plate}
                        onChange={(e) => {
                          const value = e.target.value.toUpperCase();
                          setFormData({...formData, plate: value});
                          if (isSupabaseConnected) handlePlateLookup(value);
                        }}
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
          const activeJob = jobs.find(j => String(j.id) === String(activeJobId));
          return (
            <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => { setIsBudgetModalOpen(false); setActiveJobId(null); budgetJobIdRef.current = null; }}
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
                    <button onClick={() => { setIsBudgetModalOpen(false); setActiveJobId(null); budgetJobIdRef.current = null; }} className="p-2 bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
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
                        className={cn(
                          "w-full bg-[#0B132B] border-2 border-white/10 rounded-2xl py-5 px-6 text-3xl font-black focus:border-blue-500 focus:outline-none transition-all",
                          activeJob?.status === 'ready' && "opacity-50 cursor-not-allowed"
                        )}
                        value={budgetAmount}
                        onChange={(e) => { if (activeJob?.status !== 'ready') setBudgetAmount(e.target.value); }}
                        disabled={activeJob?.status === 'ready'}
                        autoFocus
                      />
                      {activeJob?.status === 'ready' && (
                        <p className="text-xs text-amber-400 font-bold ml-1">Precio bloqueado — vehículo listo para entregar</p>
                      )}
                    </div>

                    <button
                      onClick={handleSaveBudget}
                      disabled={isSavingBudget}
                      className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100"
                    >
                      {isSavingBudget ? 'Guardando...' : 'Guardar informe'}
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
        className="fixed bottom-[76px] right-5 w-14 h-14 bg-blue-600 hover:bg-blue-500 text-white rounded-full flex items-center justify-center active:scale-90 transition-all z-50 shadow-lg shadow-blue-500/40"
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


