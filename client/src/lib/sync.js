import { listPendingVisits, markSynced } from './db';

export const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

const listeners = new Set();
let state = {
  online: navigator.onLine,
  syncing: false,
  lastSyncedAt: null,
  lastError: null,
  pendingCount: 0,
};

function emit() {
  listeners.forEach((fn) => fn(state));
}

export function subscribeSyncStatus(fn) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

async function refreshPendingCount() {
  const pending = await listPendingVisits();
  state = { ...state, pendingCount: pending.length };
  emit();
  return pending;
}

/** Push every locally-queued visit to the central store. Safe to call repeatedly. */
export async function trySync() {
  if (!navigator.onLine) return;
  const pending = await refreshPendingCount();
  if (pending.length === 0) return;

  state = { ...state, syncing: true, lastError: null };
  emit();

  try {
    const res = await fetch(`${API_BASE}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ visits: pending }),
    });
    if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);
    const { accepted } = await res.json();
    for (const item of accepted) {
      await markSynced(item.localId, item.serverId);
    }
    await refreshPendingCount();
    state = { ...state, syncing: false, lastSyncedAt: new Date().toISOString() };
  } catch (err) {
    state = { ...state, syncing: false, lastError: err.message };
  }
  emit();
}

export function initSyncEngine() {
  refreshPendingCount();

  window.addEventListener('online', () => {
    state = { ...state, online: true };
    emit();
    trySync();
  });
  window.addEventListener('offline', () => {
    state = { ...state, online: false };
    emit();
  });

  // Fallback poll in case connectivity returns without a browser 'online' event
  // (some captive-portal / flaky-network setups don't fire it reliably).
  const interval = setInterval(() => {
    if (navigator.onLine) trySync();
  }, 15000);

  trySync();

  return () => clearInterval(interval);
}

export function notifyNewVisitQueued() {
  refreshPendingCount();
  if (navigator.onLine) trySync();
}
