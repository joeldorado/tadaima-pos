import { apiClient } from './client';

export type IncomeType = 'service_fee' | 'equipment_sale' | 'vendor_refund' | 'other';

export interface IncomeMovementRecord {
  id: number;
  register_session_id: number;
  store_id: number | null;
  type: IncomeType;
  amount: number;
  description: string | null;
  cash_movement_id: number | null;
  user: { id: number; name: string } | null;
  user_id: number;
  created_at: string;
}

export async function registerIncome(input: {
  type: IncomeType;
  amount: number;
  description?: string;
  store_id?: number | null;
}): Promise<IncomeMovementRecord> {
  const { data } = await apiClient.post('/income-movements', input);
  return data;
}

export async function getIncomeMovements(filters?: {
  from?: string;
  to?: string;
  type?: IncomeType;
  store_id?: number;
  user_id?: number;
  dates?: string;
  whole_store?: boolean;
}): Promise<IncomeMovementRecord[]> {
  const { data } = await apiClient.get('/income-movements', { params: filters });
  return data || [];
}

export async function deleteIncomeMovement(id: number): Promise<void> {
  await apiClient.delete(`/income-movements/${id}`);
}
