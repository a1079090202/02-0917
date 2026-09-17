import type {
  AuditEntry,
  BoardSpec,
  ChangeOrder,
  OrderDetail,
  OrderListItem,
  Plan,
  Remnant,
  RemnantLedger,
  Utilization,
} from './types';

const BASE = '/api';

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `请求失败（${res.status}）`);
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  req<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) });

export interface OrderItemInput {
  part_name: string;
  spec_id: number;
  length_mm: number;
  width_mm: number;
  quantity: number;
}

export const api = {
  // 板材台账
  listBoards: () => req<BoardSpec[]>('/boards'),
  createBoard: (b: { name: string; length_mm: number; width_mm: number; thickness_mm: number; material: string }) =>
    post<BoardSpec>('/boards', b),

  // 订单
  listOrders: () => req<OrderListItem[]>('/orders'),
  createOrder: (o: { customer: string; note: string; items: OrderItemInput[] }) =>
    post<OrderDetail>('/orders', o),
  getOrder: (id: number) => req<OrderDetail>(`/orders/${id}`),
  orderAudit: (id: number) => req<AuditEntry[]>(`/orders/${id}/audit`),

  // 套裁方案
  generatePlan: (orderId: number, opts: { allowRotation: boolean; kerf: number }) =>
    post<Plan>(`/orders/${orderId}/plans`, opts),
  getPlan: (id: number) => req<Plan>(`/plans/${id}`),
  executePlan: (id: number) => post<Plan>(`/plans/${id}/execute`),

  // 余料台账
  listRemnants: (params: { status?: string; spec_id?: number } = {}) => {
    const q = new URLSearchParams();
    if (params.status) q.set('status', params.status);
    if (params.spec_id) q.set('spec_id', String(params.spec_id));
    const s = q.toString();
    return req<Remnant[]>(`/remnants${s ? '?' + s : ''}`);
  },
  updateRemnantLocation: (id: number, location: string) =>
    req<Remnant>(`/remnants/${id}`, { method: 'PATCH', body: JSON.stringify({ location }) }),

  // 变更单
  applyChange: (
    orderId: number,
    payload: {
      reason: string;
      adds: OrderItemInput[];
      reductions: Array<{ item_id: number; new_quantity: number }>;
    },
  ) => post<{ change: ChangeOrder; plan: Plan | null }>(`/orders/${orderId}/changes`, payload),
  listChanges: () => req<ChangeOrder[]>('/changes'),

  // 统计
  utilization: (month: string) => req<Utilization>(`/stats/utilization?month=${month}`),
  remnantLedger: (month: string) => req<RemnantLedger>(`/stats/remnants?month=${month}`),
};
