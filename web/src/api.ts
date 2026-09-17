/** 薄 API 封装，错误统一抛后端 message */
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let msg = `请求失败 ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export const api = {
  materials: () => request<any[]>('/api/materials'),
  createMaterial: (b: unknown) =>
    request<{ id: number }>('/api/materials', { method: 'POST', body: JSON.stringify(b) }),
  restock: (id: number, qty: number) =>
    request(`/api/materials/${id}/restock`, { method: 'POST', body: JSON.stringify({ qty }) }),

  orders: () => request<any[]>('/api/orders'),
  createOrder: (b: unknown) =>
    request<{ id: number }>('/api/orders', { method: 'POST', body: JSON.stringify(b) }),
  orderDetail: (id: number) => request<any>(`/api/orders/${id}`),
  preview: (id: number) => request<any>(`/api/orders/${id}/preview`, { method: 'POST' }),
  cut: (id: number) => request<any>(`/api/orders/${id}/cut`, { method: 'POST' }),

  change: (id: number, b: unknown) =>
    request<any>(`/api/orders/${id}/changes`, { method: 'POST', body: JSON.stringify(b) }),
  changes: () => request<any[]>('/api/changes'),

  remnants: (params: Record<string, string | number | undefined> = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== '') q.set(k, String(v));
    }
    const suffix = q.toString() ? `?${q}` : '';
    return request<any[]>(`/api/remnants${suffix}`);
  },
  remnantSummary: () => request<any[]>('/api/remnants/summary'),
  match: (spec_id: number, parts: unknown) =>
    request<any[]>('/api/remnants/match', {
      method: 'POST',
      body: JSON.stringify({ spec_id, parts }),
    }),

  monthly: (month?: string) =>
    request<any>(`/api/stats/monthly${month ? `?month=${month}` : ''}`),
  months: () => request<any[]>('/api/stats/months'),
  bySpec: (month?: string) =>
    request<any[]>(`/api/stats/by-spec${month ? `?month=${month}` : ''}`),
};
