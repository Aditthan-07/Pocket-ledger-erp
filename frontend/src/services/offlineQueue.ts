/**
 * Pocket Ledger ERP - Offline-First Queue & Sync Service
 * Supports real navigator.onLine and interactive "Simulated Offline" toggle
 * Stores queued orders in localStorage and flushes automatically on reconnect.
 */

import { api } from '../api/client';

export interface QueuedOrder {
  client_offline_id: string;
  queued_at: string;
  customer_id: number;
  salesman_id: number;
  items: Array<{ item_id: number; qty_packets: number; unit_price_paisa?: number }>;
  order_date: string;
  notes?: string;
  delivery_destination?: string;
  customer_name?: string;
  total_rupees?: number;
}

const STORAGE_KEY = 'pocket_ledger_offline_queue';
const SIMULATED_OFFLINE_KEY = 'pocket_ledger_simulated_offline';

type SyncCallback = (status: 'synced' | 'failed' | 'empty', count: number) => void;

class OfflineQueueService {
  private isSimulatedOffline: boolean = false;
  private syncListeners: Set<() => void> = new Set();
  private toastCallback: SyncCallback | null = null;

  constructor() {
    // Restore simulated state from localStorage
    const savedSim = localStorage.getItem(SIMULATED_OFFLINE_KEY);
    this.isSimulatedOffline = savedSim === 'true';

    // Listen to browser network changes
    window.addEventListener('online', () => this.handleNetworkChange());
    window.addEventListener('offline', () => this.notifyListeners());
  }

  public registerToastHandler(cb: SyncCallback) {
    this.toastCallback = cb;
  }

  public subscribe(listener: () => void): () => void {
    this.syncListeners.add(listener);
    return () => {
      this.syncListeners.delete(listener);
    };
  }

  private notifyListeners() {
    this.syncListeners.forEach((fn) => fn());
  }

  public isOnline(): boolean {
    if (this.isSimulatedOffline) return false;
    return typeof navigator !== 'undefined' ? navigator.onLine : true;
  }

  public isSimulated(): boolean {
    return this.isSimulatedOffline;
  }

  public toggleSimulatedOffline(): boolean {
    this.isSimulatedOffline = !this.isSimulatedOffline;
    localStorage.setItem(SIMULATED_OFFLINE_KEY, String(this.isSimulatedOffline));
    this.notifyListeners();

    // If turned back online, auto-flush immediately
    if (this.isOnline()) {
      this.flushQueue();
    }
    return this.isSimulatedOffline;
  }

  public getQueue(): QueuedOrder[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  public enqueueOrder(order: Omit<QueuedOrder, 'client_offline_id' | 'queued_at'>): QueuedOrder {
    const queue = this.getQueue();
    const queuedItem: QueuedOrder = {
      ...order,
      client_offline_id: `OFFLINE-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      queued_at: new Date().toISOString(),
    };
    queue.push(queuedItem);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
    this.notifyListeners();
    return queuedItem;
  }

  public async flushQueue(): Promise<{ synced: number; failed: number }> {
    const queue = this.getQueue();
    if (queue.length === 0 || !this.isOnline()) {
      return { synced: 0, failed: 0 };
    }

    let syncedCount = 0;
    const remainingQueue: QueuedOrder[] = [];

    for (const order of queue) {
      try {
        await api.submitSalesOrder({
          customer_id: order.customer_id,
          salesman_id: order.salesman_id,
          items: order.items,
          order_date: order.order_date,
          notes: order.notes,
          delivery_destination: order.delivery_destination,
          client_offline_id: order.client_offline_id,
        });
        syncedCount++;
      } catch (err) {
        console.error(`Failed to sync queued order ${order.client_offline_id}:`, err);
        remainingQueue.push(order);
      }
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(remainingQueue));
    this.notifyListeners();

    if (this.toastCallback && syncedCount > 0) {
      this.toastCallback('synced', syncedCount);
    }

    return { synced: syncedCount, failed: remainingQueue.length };
  }

  private handleNetworkChange() {
    this.notifyListeners();
    if (this.isOnline()) {
      this.flushQueue();
    }
  }
}

export const offlineQueue = new OfflineQueueService();
