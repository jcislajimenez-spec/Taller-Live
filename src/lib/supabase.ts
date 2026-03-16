import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL o Anon Key no configuradas. La aplicación usará datos locales hasta que se configuren las variables de entorno.');
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key'
);

// Tipos para TypeScript basados en el esquema SQL
export type Customer = {
  id: string;
  name: string;
  phone: string;
  created_at: string;
};

export type Vehicle = {
  id: string;
  plate: string;
  model: string;
  customer_id: string;
  created_at: string;
};

export type Order = {
  id: string;
  vehicle_id: string;
  customer_id: string;
  status: 'awaiting_diagnosis' | 'diagnosing' | 'waiting_customer' | 'repairing' | 'ready' | 'delivered';
  urgency: 'low' | 'medium' | 'high';
  description: string;
  budget: number | null;
  total_estimated: number | null;
  public_token: string | null;
  created_at: string;
  // Join fields
  vehicle?: Vehicle;
  customer?: Customer;
};

export type OrderMedia = {
  id: string;
  order_id: string;
  file_url: string;
  media_type: 'image' | 'audio' | 'video' | 'document';
  note: string | null;
  created_at: string;
};
