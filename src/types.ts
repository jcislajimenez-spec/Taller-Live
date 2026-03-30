export type JobStatus = 'waiting' | 'diagnosed' | 'waiting_customer' | 'repairing' | 'ready' | 'delivered' | 'awaiting_diagnosis' | 'diagnosing';
export type Urgency = 'low' | 'medium' | 'high';

export type Job = {
  id: string;
  vehicle_id?: string;
  plate: string;
  model: string;
  customer: string;
  customerPhone: string;
  status: JobStatus;
  urgency?: Urgency;
  budget: string;
  budgetShared: boolean;
  aiDiagnosis: string;
  description: string;
  public_token: string | null;
  is_accepted: boolean;
  quote_version: number;
  approved_quote_version: number | null;
  approved_at: string | null;
  photos: string[];
  audios: string[];
  audioNotes?: string[];
  entryTime: string;
  created_at?: string;
};
