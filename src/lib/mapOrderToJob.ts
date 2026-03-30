import type { Job } from '../types';

// Transformación única: Supabase order row → job de React.
// Única fuente de verdad para la estructura de un job en el frontend.
// Usada por fetchJobsFromSupabase y refreshSingleJob.
export const mapOrderToJob = (order: any): Job => ({
  id: order.id,
  vehicle_id: order.vehicle_id,
  plate: order.vehicle?.plate ?? '',
  model: order.vehicle?.model ?? '',
  customer: order.customer?.name ?? '',
  customerPhone: order.customer?.phone ?? '',
  status: order.status,
  budget: order.budget?.toString() || '0',
  aiDiagnosis: order.description,
  budgetShared: order.status === 'waiting_customer' || order.status === 'repairing' || order.status === 'ready',
  urgency: order.urgency,
  entryTime: new Date(order.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) + ' ' + new Date(order.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  description: order.description,
  public_token: order.public_token,
  is_accepted: order.is_accepted ?? false,
  quote_version: order.quote_version ?? 1,
  approved_quote_version: order.approved_quote_version ?? null,
  approved_at: order.approved_at ?? null,
  photos: order.media?.filter((m: any) => m.media_type === 'image').map((m: any) => m.file_url) || [],
  audios: order.media?.filter((m: any) => m.media_type === 'audio').map((m: any) => m.file_url) || [],
  audioNotes: order.media?.filter((m: any) => m.media_type === 'audio' && m.note).map((m: any) => m.note) || [],
  created_at: order.created_at,
});
