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

// --- Tipos ---
type JobStatus = 'awaiting_diagnosis' | 'diagnosing' | 'waiting_customer' | 'repairing' | 'ready';
type Urgency = 'low' | 'medium' | 'high';

// --- Datos de Prueba (Fallback) ---
const MOCK_JOBS: any[] = [
  {
    id: '1',
    plate: '1234-LMN',
    model: 'Volkswagen Golf GTI',
    customer: 'Carlos Rodríguez',
    customerPhone: '600000001',
    status: 'diagnosing',
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
    status: 'pending_approval',
    urgency: 'medium',
    entryTime: '09:15',
    description: 'Revisión 60.000km y ruido en frenos.'
  }
];

// --- Componentes Auxiliares ---

const UrgencyBadge = ({ urgency }: { urgency: 'low' | 'medium' | 'high' }) => {
  const config = {
    low: { label: 'Baja', color: 'bg-slate-100 text-slate-600 border-slate-200' },
    medium: { label: 'Media', color: 'bg-blue-100 text-blue-600 border-blue-200' },
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
  const config = {
    awaiting_diagnosis: { label: 'En espera', color: 'bg-amber-100 text-amber-700 border-amber-200' },
    diagnosing: { label: 'Diagnosticando', color: 'bg-blue-100 text-blue-700 border-blue-200' },
    waiting_customer: { label: 'En espera (Cliente)', color: 'bg-orange-100 text-orange-700 border-orange-200' },
    repairing: { label: 'En preparación', color: 'bg-indigo-100 text-indigo-700 border-indigo-200' },
    ready: { label: 'Listo', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  };

  const { label, color } = config[status];
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border", color)}>
      {label}
    </span>
  );
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

export default function TallerLivePrototype() {
  const path = window.location.pathname;

  if (path.startsWith("/d/")) {
    const token = path.split("/d/")[1];
    return <PublicReport token={token} />;
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

  // Estados para Audio
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = React.useRef<MediaRecorder | null>(null);
  const audioChunksRef = React.useRef<Blob[]>([]);
  const timerRef = React.useRef<NodeJS.Timeout | null>(null);

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

  // --- Persistencia Automática ---
  useEffect(() => {
    if (jobs.length > 0) {
      localStorage.setItem('tallerlive_jobs', JSON.stringify(jobs));
    }
  }, [jobs]);

  // --- MEJORA: Sincronización entre pestañas (Mismo navegador) ---
  useEffect(() => {
    const syncData = () => {
      const savedJobs = localStorage.getItem('tallerlive_jobs');
      if (savedJobs) {
        const updatedJobs = JSON.parse(savedJobs);
        setJobs(updatedJobs);
        
        // Si estamos en modo cliente, actualizar también el job actual
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
    
    // También comprobamos periódicamente como fallback si no hay Supabase real
    // Esto asegura que si apruebas en una pestaña, la otra se entere pronto
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
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const updatedOrder = payload.new;
            
            // Actualizar lista global de trabajos
            setJobs(prevJobs => {
              const exists = prevJobs.find(j => String(j.id) === String(updatedOrder.id));
              if (exists) {
                return prevJobs.map(job => 
                  String(job.id) === String(updatedOrder.id) ? { 
                    ...job, 
                    status: updatedOrder.status,
                    budget: updatedOrder.budget,
                    aiDiagnosis: updatedOrder.ai_diagnosis,
                    budgetShared: updatedOrder.budget_shared
                  } : job
                );
              } else {
                // Si es nuevo y no lo tenemos (poco probable pero posible)
                return [updatedOrder, ...prevJobs];
              }
            });

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
                  aiDiagnosis: updatedOrder.ai_diagnosis
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
  }, [isSupabaseConnected]);

  // Cargar datos iniciales (LocalStorage + Supabase)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    const dataParam = params.get('d');
    const tokenParam = params.get('t');

    async function initializeApp() {
      // --- SIEMPRE cargar datos locales primero para sincronización ---
      const savedJobs = localStorage.getItem('tallerlive_jobs');
      let currentJobs = savedJobs ? JSON.parse(savedJobs) : MOCK_JOBS;
      setJobs(currentJobs);

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
                .select('*')
                .eq('id', job.id)
                .single();
              
              if (data) {
                const fullJob = {
                  ...job,
                  status: data.status,
                  photos: data.photos || job.photos,
                  aiDiagnosis: data.ai_diagnosis || job.aiDiagnosis,
                  budget: data.budget || job.budget
                };
                setClientJob(fullJob);
                // Si ya está aprobado o en reparación, marcar como aprobado para que no salga el botón
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
                budgetShared: !!data.budget,
                description: data.description,
                entryTime: new Date(data.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                photos: data.media?.filter((m: any) => m.media_type === 'image').map((m: any) => m.file_url) || [],
                audios: data.media?.filter((m: any) => m.media_type === 'audio').map((m: any) => m.file_url) || []
              };
              
              // Mezclar con local para fotos/audios si no están en Supabase aún
              const local = currentJobs.find((j: any) => String(j.id) === String(orderId));
              if (local) {
                fetchedJob.photos = fetchedJob.photos.length ? fetchedJob.photos : (local.photos || []);
                fetchedJob.audios = fetchedJob.audios.length ? fetchedJob.audios : (local.audios || []);
                fetchedJob.aiDiagnosis = fetchedJob.aiDiagnosis || local.aiDiagnosis;
              }

              setClientJob(fetchedJob);
              // CORRECCIÓN: También establecer isApproved al cargar desde Supabase
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

      // Cargar todos los trabajos para el modo taller
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

        if (data && data.length > 0) {
            const formattedJobs = data.map(order => ({
              id: order.id,
              plate: order.vehicle?.plate,
              model: order.vehicle?.model,
              customer: order.customer?.name,
              customerPhone: order.customer?.phone,
              status: order.status,
              budget: order.budget?.toString() || '0',
              aiDiagnosis: order.description, // Usamos description como diagnóstico si no hay ai_diagnosis
              budgetShared: !!order.budget,
              urgency: order.urgency,
              entryTime: new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              description: order.description,
              photos: order.media?.filter((m: any) => m.media_type === 'image').map((m: any) => m.file_url) || [],
              audios: order.media?.filter((m: any) => m.media_type === 'audio').map((m: any) => m.file_url) || []
            }));
          setJobs(formattedJobs);
        }
      } catch (e) {
        console.log('Modo offline/local activo');
      }
    }

    initializeApp();
  }, []);

  // Guardar en LocalStorage cada vez que cambien los trabajos
  useEffect(() => {
    localStorage.setItem('tallerlive_jobs', JSON.stringify(jobs));
  }, [jobs]);

  // Manejo de Fotos (Simulado)
  const handlePhotoClick = (jobId: string) => {
    setActiveJobId(jobId);
    fileInputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeJobId) {
      if (String(activeJobId).startsWith('temp-')) {
        notify("No se pueden subir fotos a un pedido que no se ha sincronizado con Supabase. Inténtalo de nuevo en unos segundos.", 'error');
        return;
      }
      addLog(`Iniciando subida de foto para job: ${activeJobId}`);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = reader.result as string;
        
        // Actualizar localmente
        setJobs(prevJobs => prevJobs.map(job => {
          if (job.id === activeJobId) {
            const newStatus: JobStatus = job.status === 'awaiting_diagnosis' ? 'diagnosing' : job.status;
            return {
              ...job,
              photos: [...(job.photos || []), base64String],
              status: newStatus
            };
          }
          return job;
        }));

        // Guardar en Supabase
        if (isSupabaseConnected) {
          try {
            // 1. Subir a Storage
            const fileName = `${activeJobId}/${Date.now()}_${file.name}`;
            addLog(`Subiendo a storage: ${fileName}`);
            const { data: uploadData, error: uploadError } = await supabase.storage
              .from('tallerlife_media')
              .upload(fileName, file);

            if (uploadError) {
              addLog(`Error subiendo a storage: ${uploadError.message}`);
              notify(`Error al subir imagen: ${uploadError.message}`, 'error');
              throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage
              .from('tallerlife_media')
              .getPublicUrl(uploadData.path);

            addLog(`Imagen subida con éxito: ${publicUrl}`);

            // 2. Guardar en order_media
            const { error: mediaError } = await supabase
              .from('order_media')
              .insert([{ 
                order_id: activeJobId,
                file_url: publicUrl,
                media_type: 'image'
              }]);

            if (mediaError) {
              addLog(`Error guardando en order_media: ${mediaError.message}`);
              notify(`Error al registrar imagen: ${mediaError.message}`, 'error');
              throw mediaError;
            }

            // 3. Actualizar estado de la orden
            await supabase
              .from('orders')
              .update({ 
                status: 'diagnosing'
              })
              .eq('id', activeJobId);
            
            notify("Imagen subida y registrada correctamente", 'success');
          } catch (e: any) {
            console.error('Error guardando media en Supabase:', e);
            addLog(`Excepción en subida: ${e.message}`);
          }
        }

        setActiveJobId(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
    }
  };

  // --- Lógica de Audio ---
  const startRecording = async (jobId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      setActiveJobId(jobId);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        if (String(jobId).startsWith('temp-')) {
          notify("No se puede guardar el audio en un pedido local. Sincroniza primero.", 'error');
          return;
        }

        addLog(`Finalizada grabación para job: ${jobId}`);
        // --- PROCESAMIENTO IA ---
        let aiText = "Procesando diagnóstico...";
        
        const reader = new FileReader();
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          
          // Actualizar inmediatamente con el audio
          setJobs(prevJobs => prevJobs.map(job => {
            if (job.id === jobId) {
              const newStatus: JobStatus = job.status === 'awaiting_diagnosis' ? 'diagnosing' : job.status;
              return {
                ...job,
                audios: [...(job.audios || []), base64Audio],
                status: newStatus,
                aiDiagnosis: aiText
              };
            }
            return job;
          }));

          // Llamada a Gemini para transcribir y profesionalizar
          try {
            
            const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

            const model = genAI.getGenerativeModel({
              model: "gemini-1.5-flash",
              generationConfig: {
                maxOutputTokens: 1000,
              },
            });

            const result = await model.generateContent([

              {
                text: "Eres un jefe de taller experto y profesional. Tu objetivo es explicarle al cliente el estado de su vehículo de forma clara pero técnica.\n\nINSTRUCCIONES:\n1. Empieza DIRECTAMENTE con el diagnóstico (ej: 'Hemos detectado...').\n2. No incluyas saludos ni introducciones como '¡Claro que sí!' o 'Como jefe de taller...'.\n3. Estructura el texto en párrafos cortos y claros.\n4. Explica QUÉ avería hay, POR QUÉ ha ocurrido y qué RIESGOS conlleva no repararlo.\n5. Usa un tono profesional y educativo (entre 60 y 90 palabras).\n\nQueremos que el cliente entienda perfectamente el valor y la necesidad de la reparación."
              },
              {
                inlineData: {
                  data: base64Audio.split(",")[1],
                  mimeType: "audio/webm",
                },
              },
            ]);

            const professionalText =
              result.response.text() || "Diagnóstico técnico generado correctamente.";
          
            setJobs(prevJobs => prevJobs.map(job => {
              if (job.id === jobId) {
                return { ...job, aiDiagnosis: professionalText };
              }
              return job;
            }));

            if (isSupabaseConnected) {
              // 1. Subir audio a Storage
              const fileName = `${jobId}/${Date.now()}_audio.webm`;
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('tallerlife_media')
                .upload(fileName, audioBlob);

              if (uploadError) {
                addLog(`Error subiendo audio: ${uploadError.message}`);
                notify(`Error al subir audio: ${uploadError.message}`, 'error');
                throw uploadError;
              }

              const { data: { publicUrl } } = supabase.storage
                .from('tallerlife_media')
                .getPublicUrl(uploadData.path);

              addLog(`Audio subido: ${publicUrl}`);

              // 2. Guardar en order_media
              const { error: mediaError } = await supabase
                .from('order_media')
                .insert([{ 
                  order_id: jobId,
                  file_url: publicUrl,
                  media_type: 'audio',
                  note: professionalText
                }]);
              
              if (mediaError) {
                addLog(`Error registrando audio: ${mediaError.message}`);
                notify(`Error al registrar audio: ${mediaError.message}`, 'error');
                throw mediaError;
              }

              // 3. Actualizar orden
              await supabase.from('orders').update({ 
                description: professionalText,
                status: 'diagnosing'
              }).eq('id', jobId);

              notify("Audio procesado y guardado correctamente", 'success');
            }
          } catch (err: any) {
            console.error("Error IA:", err);
            addLog(`Error en procesamiento de audio: ${err.message}`);
            notify(`Error al procesar audio: ${err.message}`, 'error');
          }

          setActiveJobId(null);
        };
        reader.readAsDataURL(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error("Error al acceder al micrófono:", err);
      addLog(`Error micrófono: ${err.message}`);
      notify("Necesitas dar permiso al micrófono para grabar audios.", 'error');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) clearInterval(timerRef.current);
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
    setIsBudgetModalOpen(true);
  };

  const handleSaveBudget = async () => {
    if (activeJobId) {
      const currentJob = jobs.find(j => j.id === activeJobId);
      if (!currentJob) return;

      const budgetToSave = budgetAmount || '0';
      const updatedStatus = 'waiting_customer';
      
      setJobs(prevJobs => prevJobs.map(job => {
        if (job.id === activeJobId) {
          return {
            ...job,
            budget: budgetToSave,
            status: updatedStatus,
            budgetShared: true
          };
        }
        return job;
      }));

      // Sincronizar con Supabase si está conectado
      if (isSupabaseConnected) {
        try {
          await supabase
            .from('orders')
            .update({ 
              budget: parseFloat(budgetToSave), 
              status: updatedStatus
            })
            .eq('id', activeJobId);
        } catch (e) {
          console.error('Error sincronizando presupuesto:', e);
        }
      }

      setIsBudgetModalOpen(false);
      setActiveJobId(null);
      setBudgetAmount('');

      // Activar WhatsApp inmediatamente
      const jobToShare = { ...currentJob, budget: budgetToSave, status: updatedStatus };
      handleWhatsAppShare(jobToShare, true);
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

    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
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
      window.open(`https://wa.me/${phone}?text=${encodedMessage}`, '_blank');
    }

    // Si hay email, también intentamos abrir el cliente de correo
    if (job.customerEmail) {
      const subject = encodeURIComponent(`Vehículo Listo para Recoger - ${job.plate}`);
      const body = encodeURIComponent(message.replace(/\*/g, '')); // Quitamos los asteriscos de negrita de WhatsApp
      window.open(`mailto:${job.customerEmail}?subject=${subject}&body=${body}`, '_blank');
    }
  };

  // --- MEJORA: Polling para sincronización en tiempo real del taller ---
  useEffect(() => {
    if (viewMode === 'taller' && isSupabaseConnected) {
      const interval = setInterval(async () => {
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

          if (data && data.length > 0) {
            const formattedJobs = data.map((d: any) => ({
              id: d.id,
              plate: d.vehicle?.plate,
              model: d.vehicle?.model,
              customer: d.customer?.name,
              customerPhone: d.customer?.phone,
              status: d.status,
              budget: d.budget?.toString() || '0',
              aiDiagnosis: d.description,
              budgetShared: !!d.budget,
              description: d.description,
              entryTime: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              photos: d.media?.filter((m: any) => m.media_type === 'image').map((m: any) => m.file_url) || [],
              audios: d.media?.filter((m: any) => m.media_type === 'audio').map((m: any) => m.file_url) || []
            }));
            
            // --- MEJORA: No sobrescribir si hay cambios locales más recientes ---
            setJobs(prevJobs => {
              if (formattedJobs.length === 0 && prevJobs.length > 0) return prevJobs;
              
              const merged = [...formattedJobs];
              
              // Mantener trabajos locales que aún no están en Supabase (IDs temporales)
              prevJobs.forEach(localJob => {
                const isSynced = merged.some(m => String(m.id) === String(localJob.id));
                if (!isSynced) {
                  merged.push(localJob);
                }
              });

              return merged.map(newJob => {
                const localJob = prevJobs.find(j => String(j.id) === String(newJob.id));
                if (localJob) {
                  return {
                    ...newJob,
                    photos: localJob.photos?.length ? localJob.photos : newJob.photos,
                    audios: localJob.audios?.length ? localJob.audios : newJob.audios,
                    aiDiagnosis: localJob.aiDiagnosis || newJob.aiDiagnosis,
                    budgetShared: localJob.budgetShared || newJob.budgetShared,
                    // Preservar estado local si Supabase aún no se ha actualizado (especialmente tras aprobación)
                    status: (() => {
                      const statusOrder = ['awaiting_diagnosis', 'diagnosing', 'waiting_customer', 'repairing', 'ready', 'delivered'];
                      const localIdx = statusOrder.indexOf(localJob.status);
                      const remoteIdx = statusOrder.indexOf(newJob.status);
                      
                      if (localJob.status === 'repairing' && newJob.status === 'waiting_customer') return 'repairing';
                      if (remoteIdx > localIdx) return newJob.status;
                      return localJob.status;
                    })()
                  };
                }
                return newJob;
              });
            });
          }
        } catch (e) {
          console.log("Error en polling");
        }
      }, 10000);

      return () => clearInterval(interval);
    }
  }, [viewMode, isSupabaseConnected]);

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
            status: 'awaiting_diagnosis', 
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
          status: 'awaiting_diagnosis',
          urgency: formData.urgency,
          entryTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
        status: 'awaiting_diagnosis',
        urgency: formData.urgency,
        entryTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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
      localStorage.setItem('tallerlive_jobs', JSON.stringify(newJobs));
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

            <div className="bg-blue-50 p-4 rounded-2xl mb-6">
              <p className="text-blue-700 text-xs font-bold uppercase tracking-widest">Próximo paso:</p>
              <p className="text-blue-900 text-sm font-black mt-1">Le avisaremos por WhatsApp cuando el coche esté listo.</p>
            </div>
            <button 
              onClick={() => window.location.href = `tel:601105816`}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2"
            >
              <Phone size={16} /> Llamar al Taller
            </button>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-50 pb-12">
        <header className="bg-[#050A1F] text-white p-6 rounded-b-[40px] shadow-xl text-center">
          <h1 className="text-xl font-black tracking-tighter uppercase italic text-blue-400 mb-2">TallerLive</h1>
          <h2 className="text-lg font-black uppercase tracking-widest">Informe de Diagnóstico</h2>
          <p className="text-blue-400 text-xs font-bold mt-1">Automoción Mendoza, S.L.</p>
        </header>

        <main className="p-5 space-y-6 -mt-6">
          <div className="bg-white rounded-[32px] p-6 shadow-xl border border-slate-100">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-[10px] font-black text-blue-500 uppercase tracking-widest">Vehículo</span>
                <h3 className="text-2xl font-black text-slate-900">{clientJob.plate}</h3>
                <p className="text-slate-500 font-bold">{clientJob.model}</p>
              </div>
              <StatusBadge status={clientJob.status} />
            </div>

            <div className="space-y-4">
              <div className="flex flex-col gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div className="flex justify-between items-center">
                  <div className="flex-1">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Presupuesto Estimado</span>
                    <span className="text-3xl font-black text-blue-600">{clientJob.budget || '0'}€</span>
                  </div>
                  {clientJob.photos?.length > 0 && (
                    <div className="w-24 h-24 rounded-xl overflow-hidden border-2 border-white shadow-md shrink-0">
                      <img src={clientJob.photos[0]} alt="Evidencia" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>

              {clientJob.aiDiagnosis && (
                <div className="bg-blue-50 p-5 rounded-[24px] border border-blue-100 relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-3 opacity-10">
                    <Wrench size={40} className="text-blue-600" />
                  </div>
                  <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.2em] block mb-3">Informe de Diagnóstico</span>
                  <p className="text-slate-800 font-bold text-sm leading-relaxed relative z-10">
                    {clientJob.aiDiagnosis}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Pruebas Visuales */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Evidencias del Taller</h3>
            
            {clientJob.photos?.length > 0 && (
              <div className="grid grid-cols-2 gap-3">
                {clientJob.photos.map((photo: string, i: number) => (
                  <div key={i} className="aspect-square rounded-2xl overflow-hidden border-2 border-white shadow-md">
                    <img src={photo} alt="Evidencia" className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            )}

            {clientJob.audios?.length > 0 && (
              <div className="space-y-2">
                {clientJob.audios.map((audio: string, i: number) => (
                  <div key={i} className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600">
                      <Mic size={20} />
                    </div>
                    <audio controls src={audio} className="flex-1 h-8" />
                  </div>
                ))}
              </div>
            )}
          </div>

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
                  <span>Si ves <b>"Page not found"</b>, asegúrate de haber iniciado sesión en Google en este navegador.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600 font-bold">•</span>
                  <span>Si ves un error de <b>cookies</b>, pulsa el botón "Autenticar en nueva ventana" que aparece en pantalla.</span>
                </li>
                <li className="flex gap-2">
                  <span className="text-blue-600 font-bold">•</span>
                  <span>Este sistema está en fase de pruebas. Si el error persiste, contacta directamente con Automoción Mendoza.</span>
                </li>
              </ul>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans pb-24">
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

      {/* Panel de Debug (Oculto por defecto, se puede activar con un botón o gesto) */}
      <div className="fixed bottom-24 left-4 z-[500]">
        <details className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-white/10 overflow-hidden max-w-[300px]">
          <summary className="p-3 cursor-pointer text-[10px] font-black uppercase tracking-widest bg-slate-800 flex items-center gap-2">
            <Terminal size={14} />
            Logs de Sistema
          </summary>
          <div className="p-3 max-h-[200px] overflow-y-auto font-mono text-[9px] space-y-1">
            {debugLogs.length === 0 && <p className="opacity-50">No hay logs todavía...</p>}
            {debugLogs.map((log, i) => (
              <div key={i} className="border-b border-white/5 pb-1 last:border-0">
                <span className="text-blue-400 mr-2">[{new Date().toLocaleTimeString()}]</span>
                {log}
              </div>
            ))}
          </div>
        </details>
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

      {/* Header de Alto Impacto */}
      <header className="bg-[#050A1F] text-white p-5 pb-8 rounded-b-[32px] shadow-2xl border-b-2 border-blue-500/30">
        {!isSupabaseConnected && (
          <div className="bg-amber-500/20 border border-amber-500/30 text-amber-400 text-[10px] font-bold py-1 px-3 rounded-full mb-4 text-center">
            MODO DEMO LOCAL: Los links solo funcionan en este navegador
          </div>
        )}
        <div className="flex flex-col gap-5">
          <div className="flex justify-between items-center">
            {/* Izquierda: Logo App */}
            <div className="flex items-center gap-2.5">
              <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-500/40">
                <Wrench className="text-white" size={20} />
              </div>
              <div className="flex flex-col">
                <h1 className="text-lg font-black tracking-tighter uppercase italic text-blue-400 leading-none">TallerLive</h1>
                <div className="flex items-center gap-1 mt-1">
                  <div className={`w-1.5 h-1.5 rounded-full ${isSupabaseConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-400">
                    {isSupabaseConnected ? 'Nube Conectada' : 'Modo Local (Sin Sincro)'}
                  </span>
                </div>
              </div>
            </div>

            {/* Derecha: Ajustes y Refrescar */}
            <div className="flex items-center gap-2">
              <button 
                onClick={async () => {
                  setIsLoading(true);
                  const savedJobs = localStorage.getItem('tallerlive_jobs');
                  if (savedJobs) setJobs(JSON.parse(savedJobs));
                  
                  if (isSupabaseConnected) {
                    try {
                      const { data } = await supabase
                        .from('orders')
                        .select(`*, vehicle:vehicles(*), customer:customers(*)`)
                        .order('created_at', { ascending: false });
                      if (data) {
                        const formatted = data.map((d: any) => ({
                          id: d.id,
                          plate: d.vehicle?.plate,
                          model: d.vehicle?.model,
                          customer: d.customer?.name,
                          customerPhone: d.customer?.phone,
                          customerEmail: d.customer?.email,
                          status: d.status,
                          budget: d.budget,
                          aiDiagnosis: d.ai_diagnosis,
                          budgetShared: d.budget_shared,
                          description: d.description,
                          entryTime: new Date(d.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                          photos: [],
                          audios: []
                        }));
                        setJobs(formatted);
                      }
                    } catch (e) {}
                  }
                  setTimeout(() => setIsLoading(false), 500);
                }}
                className={cn(
                  "bg-white/10 p-2.5 rounded-2xl border border-white/10 backdrop-blur-md text-blue-400 hover:bg-white/20 transition-all",
                  isLoading && "animate-spin"
                )}
                title="Refrescar Datos"
              >
                <RefreshCw size={20} />
              </button>
              <div className="bg-white/10 p-2.5 rounded-2xl border border-white/10 backdrop-blur-md">
                <SettingsIcon className="text-blue-400" size={22} />
              </div>
            </div>
          </div>

          {/* Centro: Branding Mendoza - MÁS GRANDE Y POTENTE */}
          <div className="flex-1 text-center bg-blue-600/5 py-3 rounded-2xl border border-blue-500/10 relative">
            <h2 className="text-xl font-black tracking-[0.15em] uppercase text-white leading-none">
              AUTOMOCIÓN MENDOZA, S.L.
            </h2>
            <p className="text-xs font-black text-blue-400 tracking-[0.4em] mt-1.5 opacity-90">
              (ALFARO)
            </p>
            {/* Indicador de Conexión */}
            <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 translate-y-full flex items-center gap-1.5">
              <div className={cn("w-1.5 h-1.5 rounded-full animate-pulse", isSupabaseConnected ? "bg-emerald-400" : "bg-red-400")} />
              <span className={cn("text-[8px] font-black uppercase tracking-widest", isSupabaseConnected ? "text-emerald-400/70" : "text-red-400/70")}>
                {isSupabaseConnected ? "Sincronizado" : "Sin Conexión"}
              </span>
            </div>
          </div>

          <button 
            onClick={() => window.location.reload()}
            className="p-3 bg-white/10 rounded-2xl text-white hover:bg-white/20 transition-all active:scale-90"
            title="Sincronizar"
          >
            <RefreshCw size={20} />
          </button>
        </div>

        {/* Buscador de Matrícula - Más integrado */}
        <div className="relative mt-6">
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
        <StatCard label="En Taller" value={jobs.length} color="text-blue-500" />
        <StatCard label="Pendientes" value={jobs.filter(j => j.status === 'diagnosing' || j.status === 'waiting_customer' || j.status === 'awaiting_diagnosis').length} color="text-amber-500" />
        <StatCard label="Listos" value={jobs.filter(j => j.status === 'ready').length} color="text-emerald-500" />
      </div>

      {/* Lista de Trabajos - Más densa y visual */}
      <main className="p-5 space-y-4">
        {activeTab === 'taller' && (
          <>
            {!isSupabaseConnected && (
              <div className="bg-blue-50 border border-blue-100 p-4 rounded-2xl mb-4">
                <p className="text-[10px] text-blue-700 font-bold uppercase leading-relaxed">
                  💡 <span className="underline">Nota de Sincronización</span>: Como no hay base de datos conectada, los cambios que hagas en el móvil NO aparecerán aquí automáticamente. Prueba a abrir el link en este mismo navegador para ver la magia.
                </p>
              </div>
            )}
            <div className="flex justify-between items-center px-1">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em]">Cola de Trabajo Activa</h2>
              <div className="flex items-center gap-1.5 text-blue-500 font-black text-xs uppercase cursor-pointer">
                <Filter size={14} />
                <span>Filtrar</span>
              </div>
            </div>

            <AnimatePresence>
              {jobs
                .filter(j => 
                  (j.plate || '').toLowerCase().includes((filter || '').toLowerCase()) || 
                  (j.model || '').toLowerCase().includes((filter || '').toLowerCase()) ||
                  (j.customer || '').toLowerCase().includes((filter || '').toLowerCase())
                )
                .map((job, index) => (
                <motion.div 
                  key={job.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="bg-white rounded-[28px] p-4 shadow-md border border-slate-200/80 relative overflow-hidden active:scale-[0.98] transition-transform"
                >
                  {/* Indicador Lateral de Urgencia */}
                  <div className={cn(
                    "absolute left-0 top-0 bottom-0 w-2",
                    job.urgency === 'high' ? 'bg-red-500' : job.urgency === 'medium' ? 'bg-amber-500' : 'bg-emerald-500'
                  )} />

                  <div className="flex justify-between items-center mb-3">
                    <div className="flex items-baseline gap-3">
                      <span className="text-2xl font-black tracking-tighter text-slate-900">
                        {job.plate}
                      </span>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        {job.model}
                      </span>
                    </div>
                      <div className="flex items-center gap-2">
                        <UrgencyBadge urgency={job.urgency} />
                        <button 
                          onClick={() => handleEditJob(job)}
                          className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => setDeleteConfirmId(job.id)}
                          className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                        <StatusBadge status={job.status} />
                      </div>
                  </div>

                  {/* CLIENTE - MÁS GRANDE Y SIN ESPACIOS MUERTOS */}
                  <div className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-2xl border border-slate-100 mb-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest leading-none mb-1">Cliente</span>
                      <h3 className="text-base font-black text-slate-800 leading-none">
                        {(job.customer || '').toUpperCase()}
                      </h3>
                    </div>
                    <div className="flex items-center gap-3">
                      {/* Contadores de Pruebas */}
                      <div className="flex gap-1.5">
                        <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                          <Camera size={10} className="text-blue-500" />
                          <span className="text-[10px] font-black text-slate-600">
                            {job.photos?.length || 0}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-sm">
                          <Mic size={10} className="text-indigo-500" />
                          <span className="text-[10px] font-black text-slate-600">
                            {job.audios?.length || 0}
                          </span>
                        </div>
                      </div>
                      <div className="w-px h-6 bg-slate-200 mx-1" />
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-black text-slate-500">{job.entryTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* PREVISUALIZACIÓN DE FOTOS Y DIAGNÓSTICO IA EN TALLER */}
                  <div className="px-4 pb-3">
                    <AnimatePresence>
                      {expandedDiagnosis === job.id && job.aiDiagnosis && (
                        <motion.div 
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50 mb-2 overflow-hidden"
                        >
                          <p className="text-[10px] font-bold text-blue-700 italic leading-tight">
                            <span className="font-black uppercase not-italic mr-1">IA:</span>
                            {job.aiDiagnosis}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                  
                  {/* Botones de Acción - Rediseño Responsivo */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 relative z-10">
                    {/* FOTO */}
                    <div className="flex flex-row sm:flex-col items-center gap-3 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-2xl border border-slate-100 sm:border-0">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
                        {job.photos?.length > 0 ? (
                          <div 
                            className="relative cursor-pointer group w-full h-full"
                            onClick={() => setExpandedDiagnosis(expandedDiagnosis === job.id ? null : job.id)}
                          >
                            <img src={job.photos[0]} className="w-full h-full rounded-2xl object-cover border-2 border-slate-200 shadow-md" alt="Preview" />
                          </div>
                        ) : (
                          <div className="w-full h-full rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 opacity-40">
                            <Camera size={24} />
                          </div>
                        )}
                      </div>
                      <ActionButton 
                        icon={<Camera size={20} />} 
                        label="FOTO" 
                        className="flex-1 sm:w-full bg-blue-600 text-white border-blue-700 shadow-blue-200"
                        onClick={() => handlePhotoClick(job.id)}
                      />
                    </div>

                    {/* AUDIO */}
                    <div className="flex flex-row sm:flex-col items-center gap-3 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-2xl border border-slate-100 sm:border-0">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
                        {job.audios?.length > 0 ? (
                          <div className="w-full h-full rounded-2xl bg-emerald-500 border-2 border-emerald-600 flex items-center justify-center text-white shadow-md">
                            <Mic size={28} />
                          </div>
                        ) : (
                          <div className="w-full h-full rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 opacity-40">
                            <Mic size={24} />
                          </div>
                        )}
                      </div>
                      <ActionButton 
                        icon={<Mic size={20} />} 
                        label={isRecording && activeJobId === job.id ? "GRABANDO" : "AUDIO"} 
                        className={cn(
                          "flex-1 sm:w-full bg-slate-800 text-white border-slate-900 shadow-slate-200",
                          isRecording && activeJobId === job.id && "bg-red-600 border-red-700 animate-pulse"
                        )}
                        onClick={() => isRecording ? stopRecording() : startRecording(job.id)}
                        disabled={isRecording && activeJobId !== job.id}
                      />
                    </div>

                    {/* INFORME/PRESUPUESTO */}
                    <div className="flex flex-row sm:flex-col items-center gap-3 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-2xl border border-slate-100 sm:border-0">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
                        {job.budget && parseFloat(job.budget) > 0 ? (
                          <div className="w-full h-full rounded-2xl bg-emerald-500 border-2 border-emerald-600 flex items-center justify-center text-white shadow-md">
                            <FileText size={28} />
                          </div>
                        ) : job.aiDiagnosis && job.aiDiagnosis !== "Procesando diagnóstico..." ? (
                          <div className="w-full h-full rounded-2xl bg-blue-500 border-2 border-blue-600 flex items-center justify-center text-white shadow-md">
                            <FileText size={28} />
                          </div>
                        ) : (
                          <div className="w-full h-full rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 opacity-40">
                            <FileText size={24} />
                          </div>
                        )}
                      </div>
                      <ActionButton 
                        icon={<FileText size={20} />} 
                        label="INFORME" 
                        className={cn(
                          "flex-1 sm:w-full",
                          "bg-amber-500 text-white border-amber-600 shadow-amber-200",
                          job.aiDiagnosis && job.aiDiagnosis !== "Procesando diagnóstico..." && !job.budget && "bg-blue-500 border-blue-600",
                          job.budget && parseFloat(job.budget) > 0 && "bg-emerald-600 border-emerald-700"
                        )}
                        onClick={() => openBudgetModal(job.id)}
                      />
                    </div>

                    {/* WHATSAPP */}
                    <div className="flex flex-row sm:flex-col items-center gap-3 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-2xl border border-slate-100 sm:border-0">
                      <div className="w-16 h-16 sm:w-20 sm:h-20 flex items-center justify-center shrink-0">
                        {job.budgetShared ? (
                          <div className="w-full h-full rounded-2xl bg-emerald-500 border-2 border-emerald-600 flex items-center justify-center text-white shadow-md">
                            <MessageSquare size={28} />
                          </div>
                        ) : (
                          <div className="w-full h-full rounded-2xl bg-white border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 opacity-40">
                            <MessageSquare size={24} />
                          </div>
                        )}
                      </div>
                      <ActionButton 
                        icon={<MessageSquare size={20} />} 
                        label={job.budgetShared ? "ENVIADO" : "WHATSAPP"} 
                        className={cn(
                          "flex-1 sm:w-full",
                          job.budgetShared ? "bg-emerald-700 text-white border-emerald-800 shadow-lg" : "bg-emerald-500 text-white border-emerald-600 shadow-emerald-200",
                          (!job.budget || parseFloat(job.budget) < 0) && "opacity-30 grayscale cursor-not-allowed",
                          (job.budget && parseFloat(job.budget) >= 0 && !job.budgetShared) && "animate-pulse ring-4 ring-emerald-400/30"
                        )}
                        onClick={() => handleWhatsAppShare(job)}
                        disabled={!job.budget || parseFloat(job.budget) < 0}
                      />
                    </div>

                  {/* Botón de Finalizar (Solo si está aprobado) */}
                  {job.status === 'repairing' && job.budgetShared && (
                    <div className="mt-4 pt-4 border-t border-slate-100">
                      <button 
                        onClick={() => {
                          const updatedStatus = 'ready';
                          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: updatedStatus } : j));
                          if (isSupabaseConnected) {
                            supabase.from('orders').update({ status: updatedStatus }).eq('id', job.id).then();
                          }
                          handleReadyNotification(job);
                        }}
                        className="w-full py-4 bg-blue-500 text-white rounded-2xl font-black uppercase tracking-widest flex items-center justify-center gap-3 shadow-lg shadow-blue-100 border-b-4 border-blue-700 active:border-b-0 active:translate-y-1 transition-all"
                      >
                        <CheckCircle size={24} />
                        Finalizar Reparación
                      </button>
                    </div>
                  )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </>
        )}

        {activeTab === 'ajustes' && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-6"
          >
            <div className="bg-white rounded-[32px] p-8 shadow-xl border border-slate-100">
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-4">Configuración de Sincronización</h3>
              
              <div className="bg-blue-50 p-4 rounded-2xl mb-6 border border-blue-100">
                <h4 className="text-[10px] font-black text-blue-700 uppercase mb-2 tracking-widest">⚠️ IMPORTANTE: Activar Realtime</h4>
                <p className="text-[10px] text-blue-600 font-bold leading-relaxed">
                  Para que el dashboard se actualice solo, debes ir a tu panel de Supabase: <br/>
                  <b>Database → Replication → 'supabase_realtime' → Source: 'public' → Enable 'orders' table.</b>
                </p>
              </div>

              <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100 mb-6">
                <div className={cn(
                  "w-12 h-12 rounded-full flex items-center justify-center",
                  isSupabaseConnected ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"
                )}>
                  <RefreshCw size={24} className={isSupabaseConnected ? "animate-spin-slow" : ""} />
                </div>
                <div>
                  <p className="text-sm font-black text-slate-900 uppercase">
                    {isSupabaseConnected ? "Conexión Activa" : "Modo Local Activo"}
                  </p>
                  <p className="text-xs text-slate-500 font-medium">
                    {isSupabaseConnected 
                      ? "Tus datos se sincronizan en tiempo real con la nube." 
                      : "Los datos solo se guardan en este navegador."}
                  </p>
                </div>
              </div>

              {!isSupabaseConnected && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-600 font-medium leading-relaxed">
                    Para que el móvil y el PC se hablen, necesitas conectar <b>Supabase</b>. Sigue estos pasos:
                  </p>
                  <ol className="space-y-3 text-xs text-slate-500 font-bold uppercase tracking-wide">
                    <li className="flex gap-3">
                      <span className="bg-blue-100 text-blue-600 w-5 h-5 rounded-full flex items-center justify-center shrink-0">1</span>
                      <span>Ve a <a href="https://supabase.com" target="_blank" className="text-blue-600 underline">supabase.com</a> y crea un proyecto gratuito.</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="bg-blue-100 text-blue-600 w-5 h-5 rounded-full flex items-center justify-center shrink-0">2</span>
                      <span>Copia la <b>URL</b> y la <b>Anon Key</b> de la pestaña "API Settings".</span>
                    </li>
                    <li className="flex gap-3">
                      <span className="bg-blue-100 text-blue-600 w-5 h-5 rounded-full flex items-center justify-center shrink-0">3</span>
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

              <div className="mt-8 pt-8 border-t-4 border-blue-500 bg-blue-50/30 -mx-8 px-8 pb-8">
                <div className="flex items-center gap-3 mb-4">
                  <div className="bg-blue-500 p-2 rounded-lg text-white">
                    <SettingsIcon size={20} />
                  </div>
                  <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">URL Pública del Taller</h3>
                </div>
                
                <p className="text-sm text-slate-600 font-bold mb-4 leading-tight">
                  ⚠️ ESTE PASO ES OBLIGATORIO PARA QUE FUNCIONE EL MÓVIL DEL CLIENTE:
                </p>
                
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-blue-500 uppercase tracking-widest ml-1">Pega aquí la "Shared App URL" de AI Studio</label>
                    <input 
                      type="text"
                      className="w-full bg-white border-4 border-blue-200 rounded-2xl py-5 px-6 text-sm font-black text-blue-700 focus:border-blue-500 focus:outline-none shadow-lg transition-all placeholder:text-slate-300"
                      value={publicUrl}
                      onChange={(e) => {
                        setPublicUrl(e.target.value);
                        localStorage.setItem('tallerlive_public_url', e.target.value);
                      }}
                      placeholder="https://ais-pre-..."
                    />
                  </div>
                  
                  <div className="p-4 bg-white border-2 border-blue-100 rounded-2xl shadow-sm">
                    <p className="text-[11px] text-slate-600 font-medium leading-snug">
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
              <h3 className="text-xl font-black text-slate-900 uppercase tracking-tight">Gestión de Clientes</h3>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="bg-blue-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center gap-2 shadow-lg shadow-blue-200"
              >
                <Plus size={16} /> Nuevo Cliente
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customers.map(customer => (
                <div key={customer.id} className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100 space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-blue-100 rounded-2xl flex items-center justify-center text-blue-600">
                        <FileText size={24} />
                      </div>
                      <div>
                        <h4 className="font-black text-slate-900 uppercase tracking-tight">{customer.name}</h4>
                        <p className="text-xs text-slate-500 font-bold">{customer.phone}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="p-2 text-slate-400 hover:text-blue-600 transition-colors">
                        <Edit2 size={18} />
                      </button>
                      <button 
                        onClick={async () => {
                          if (confirm('¿Eliminar cliente y todos sus vehículos/órdenes?')) {
                            await supabase.from('customers').delete().eq('id', customer.id);
                            setCustomers(prev => prev.filter(c => c.id !== customer.id));
                          }
                        }}
                        className="p-2 text-slate-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Vehículos</p>
                    <div className="flex flex-wrap gap-2">
                      {vehicles.filter(v => v.customer_id === customer.id).map(vehicle => (
                        <div key={vehicle.id} className="bg-slate-50 border border-slate-100 px-3 py-2 rounded-xl flex items-center gap-2">
                          <span className="text-[10px] font-black text-slate-900">{vehicle.plate}</span>
                          <span className="text-[10px] font-bold text-slate-500">{vehicle.model}</span>
                        </div>
                      ))}
                      <button className="bg-blue-50 text-blue-600 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border border-blue-100 hover:bg-blue-100 transition-colors">
                        + Añadir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {customers.length === 0 && (
              <div className="text-center py-20 bg-white rounded-[32px] border-2 border-dashed border-slate-200">
                <p className="text-slate-400 font-bold uppercase tracking-widest text-xs">No hay clientes registrados</p>
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
            <div className="bg-white rounded-[40px] p-12 text-center border border-slate-100">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6">
                <History size={40} className="text-slate-300" />
              </div>
              <h3 className="text-xl font-black text-slate-900 uppercase mb-2">Historial de Trabajos</h3>
              <p className="text-slate-500 font-medium">Próximamente podrás consultar todos los trabajos finalizados aquí.</p>
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
                className="bg-white rounded-[32px] p-8 max-w-sm w-full shadow-2xl text-center"
              >
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
                  <Trash2 size={40} className="text-red-500" />
                </div>
                <h3 className="text-2xl font-black text-slate-900 mb-2">¿Eliminar registro?</h3>
                <p className="text-slate-500 font-bold mb-8">Esta acción no se puede deshacer y borrará todos los datos del vehículo.</p>
                <div className="flex gap-4">
                  <button 
                    onClick={() => setDeleteConfirmId(null)}
                    className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
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
              className="relative w-full max-w-lg bg-white rounded-t-[40px] sm:rounded-[40px] shadow-2xl overflow-hidden"
            >
              <div className="p-8">
                <div className="flex justify-between items-center mb-8">
                  <div>
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Editar Registro</h2>
                    <p className="text-slate-500 text-sm font-bold">Modifica los datos del vehículo o cliente</p>
                  </div>
                  <button 
                    onClick={() => setIsEditModalOpen(false)}
                    className="p-2 bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors"
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
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all uppercase"
                        value={formData.plate}
                        onChange={(e) => setFormData({...formData, plate: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Modelo</label>
                      <input 
                        required
                        placeholder="Seat Leon"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
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
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
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
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
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
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 text-sm font-medium focus:border-blue-500 focus:outline-none transition-all min-h-[100px]"
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
                      className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black uppercase tracking-widest hover:bg-slate-200 transition-all"
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
              <div className="p-8">
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
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
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
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
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
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all uppercase"
                        value={formData.plate}
                        onChange={(e) => setFormData({...formData, plate: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Modelo</label>
                      <input 
                        required
                        placeholder="Seat Leon"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 text-lg font-black focus:border-blue-500 focus:outline-none transition-all"
                        value={formData.model}
                        onChange={(e) => setFormData({...formData, model: e.target.value})}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Motivo Entrada</label>
                    <textarea 
                      placeholder="Descripción breve de la avería..."
                      className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-4 px-5 text-base font-bold focus:border-blue-500 focus:outline-none transition-all min-h-[100px]"
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
                className="relative w-full max-w-md bg-white rounded-t-[40px] sm:rounded-[40px] shadow-2xl overflow-hidden"
              >
                <div className="p-8">
                  <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">Presupuestar</h2>
                    <button onClick={() => setIsBudgetModalOpen(false)} className="p-2 bg-slate-100 rounded-full text-slate-400"><X size={20} /></button>
                  </div>
                  
                  <div className="space-y-6">
                    {/* Previsualización del Informe (Reporte) */}
                    {activeJob && (
                      <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 space-y-4">
                        <div className="flex flex-col gap-4">
                          {activeJob.photos?.[0] && (
                            <div className="w-full aspect-video rounded-2xl overflow-hidden border-2 border-white shadow-md">
                              <img 
                                src={activeJob.photos[0]} 
                                className="w-full h-full object-cover" 
                                alt="Evidencia" 
                              />
                            </div>
                          )}
                          <div className="bg-white p-4 rounded-2xl border border-slate-100">
                            <p className="text-[10px] font-black text-blue-500 uppercase tracking-widest mb-2">Diagnóstico Técnico</p>
                            <p className="text-sm font-bold text-slate-700 italic leading-relaxed">
                              {activeJob.aiDiagnosis || 'Sin diagnóstico procesado'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Importe Total (€)</label>
                      <input 
                        type="number"
                        placeholder="Ej: 450"
                        className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl py-5 px-6 text-3xl font-black focus:border-blue-500 focus:outline-none transition-all"
                        value={budgetAmount}
                        onChange={(e) => setBudgetAmount(e.target.value)}
                        autoFocus
                      />
                    </div>

                    <button 
                      onClick={handleSaveBudget}
                      className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-sm shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
                    >
                      Guardar y Notificar
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
        className="fixed bottom-8 right-6 w-16 h-16 bg-blue-600 text-white rounded-full shadow-2xl shadow-blue-300 flex items-center justify-center hover:bg-blue-700 active:scale-90 transition-all z-50 border-4 border-white"
      >
        <Plus size={32} />
      </button>

      {/* Navegación Inferior */}
      <nav className="fixed bottom-0 inset-x-0 bg-white/80 backdrop-blur-lg border-t border-slate-200 h-20 flex items-center justify-around px-6 z-40">
        <NavItem icon={<Wrench size={22} />} label="Taller" active={activeTab === 'taller'} onClick={() => setActiveTab('taller')} />
        <NavItem icon={<Clock size={22} />} label="Historial" active={activeTab === 'historial'} onClick={() => setActiveTab('historial')} />
        <div className="w-12" /> {/* Espacio para el botón flotante */}
        <NavItem icon={<Phone size={22} />} label="Clientes" active={activeTab === 'clientes'} onClick={() => setActiveTab('clientes')} />
        <NavItem icon={<SettingsIcon size={22} />} label="Ajustes" active={activeTab === 'ajustes'} onClick={() => setActiveTab('ajustes')} />
      </nav>
    </div>
  );
}

// --- Sub-componentes ---

function StatCard({ label, value, color }: { label: string, value: number, color: string }) {
  return (
    <div className="bg-white rounded-2xl p-3 shadow-md border border-slate-100 text-center">
      <p className="text-[10px] font-black text-slate-400 uppercase mb-1">{label}</p>
      <p className={cn("text-xl font-black", color)}>{value}</p>
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
        completed ? "bg-emerald-500 border-emerald-600 text-white shadow-lg shadow-emerald-100" : 
        active ? "bg-blue-600 border-blue-700 text-white shadow-lg shadow-blue-100 scale-110" : 
        "bg-white border-slate-200 text-slate-400"
      )}>
        {completed ? <Check size={22} strokeWidth={4} /> : icon}
      </div>
      <span className={cn(
        "text-[9px] font-black uppercase tracking-widest",
        completed ? "text-emerald-600" : active ? "text-blue-600" : "text-slate-400"
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
        active ? "text-blue-600" : "text-slate-400 hover:text-slate-600"
      )}
    >
      {icon}
      <span className="text-[9px] font-black uppercase tracking-tighter">{label}</span>
    </button>
  );
}


