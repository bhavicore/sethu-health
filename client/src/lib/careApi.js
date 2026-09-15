import { API_BASE } from './sync';

async function request(path, options = {}) {
  const res = await fetch(`${API_BASE}/api/care${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed: HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

export const careApi = {
  config: () => request('/config'),
  facilities: () => request('/facilities'),

  registerPatient: (payload) => request('/patients/register', { method: 'POST', body: JSON.stringify(payload) }),
  lookupPatient: (phone) => request(`/patients/lookup?phone=${encodeURIComponent(phone)}`),
  patientHistory: (patientId) => request(`/patients/${patientId}/history`),
  confirmWhatsapp: (patientId) => request(`/patients/${patientId}/whatsapp-consent`, { method: 'POST', body: '{}' }),

  draftEncounter: (payload) => request('/encounters/draft', { method: 'POST', body: JSON.stringify(payload) }),
  approveEncounter: (payload) => request('/encounters/approve', { method: 'POST', body: JSON.stringify(payload) }),
  getEncounter: (id) => request(`/encounters/${id}`),

  transcribe: (payload) => request('/stt', { method: 'POST', body: JSON.stringify(payload) }),

  inventory: (facilityId) => request(`/inventory/${facilityId}`),
  draftIndent: (facilityId, medicineId) =>
    request(`/inventory/${facilityId}/indents/draft`, { method: 'POST', body: JSON.stringify({ medicineId }) }),
  createIndent: (payload) => request('/indents', { method: 'POST', body: JSON.stringify(payload) }),
  listIndents: (facility, direction) => request(`/indents?facility=${facility}&direction=${direction}`),
  approveIndent: (id, payload) => request(`/indents/${id}/approve`, { method: 'POST', body: JSON.stringify(payload) }),
  rejectIndent: (id, payload) => request(`/indents/${id}/reject`, { method: 'POST', body: JSON.stringify(payload) }),

  audit: ({ entity, entityId, limit } = {}) => {
    const params = new URLSearchParams();
    if (entity) params.set('entity', entity);
    if (entityId != null) params.set('entityId', entityId);
    if (limit) params.set('limit', limit);
    const qs = params.toString();
    return request(`/audit${qs ? `?${qs}` : ''}`);
  },
};
