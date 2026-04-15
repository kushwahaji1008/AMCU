import PouchDB from 'pouchdb-browser';
import pouchdbFind from 'pouchdb-find';
import api from './axiosInstance';

PouchDB.plugin(pouchdbFind);

// Local databases
export const db = {
  farmers: new PouchDB('farmers'),
  collections: new PouchDB('collections'),
  syncQueue: new PouchDB('sync_queue')
};

// Create indexes
db.farmers.createIndex({ index: { fields: ['farmerId'] } });
db.collections.createIndex({ index: { fields: ['date', 'shift'] } });

export interface SyncTask {
  _id: string;
  type: 'CREATE_FARMER' | 'UPDATE_FARMER' | 'CREATE_COLLECTION' | 'UPDATE_COLLECTION';
  payload: any;
  timestamp: number;
}

class OfflineService {
  public isOnline: boolean = navigator.onLine;
  private syncInProgress: boolean = false;

  constructor() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.processSyncQueue();
      this.syncFromServer();
    });
    window.addEventListener('offline', () => {
      this.isOnline = false;
    });
  }

  async queueTask(type: SyncTask['type'], payload: any) {
    const task: SyncTask = {
      _id: new Date().toISOString() + '_' + Math.random().toString(36).substr(2, 9),
      type,
      payload,
      timestamp: Date.now()
    };
    await db.syncQueue.put(task);
    
    if (this.isOnline) {
      this.processSyncQueue();
    }
  }

  async processSyncQueue() {
    if (this.syncInProgress || !this.isOnline) return;
    this.syncInProgress = true;

    try {
      const result = await db.syncQueue.allDocs({ include_docs: true });
      const tasks = result.rows.map(row => row.doc as unknown as SyncTask).sort((a, b) => a.timestamp - b.timestamp);

      for (const task of tasks) {
        try {
          switch (task.type) {
            case 'CREATE_FARMER':
              await api.post('/farmers', task.payload);
              break;
            case 'UPDATE_FARMER':
              await api.put(`/farmers/${task.payload.id}`, task.payload.data);
              break;
            case 'CREATE_COLLECTION':
              await api.post('/collections', task.payload);
              break;
            case 'UPDATE_COLLECTION':
              await api.put(`/collections/${task.payload.id}`, task.payload.data);
              break;
          }
          // Remove from queue after successful sync
          await db.syncQueue.remove(task as any);
        } catch (error: any) {
          console.error('Failed to sync task:', task, error);
          if (error.status >= 400 && error.status < 500) {
             await db.syncQueue.remove(task as any);
          }
        }
      }
    } finally {
      this.syncInProgress = false;
    }
  }

  // Initial sync from server to local PouchDB
  async syncFromServer() {
    if (!this.isOnline) return;
    try {
      // Sync Farmers
      const farmersRes = await api.get('/farmers');
      const farmers = farmersRes.data;
      
      const bulkFarmers = farmers.map((f: any) => ({
        ...f,
        _id: f.id || f._id
      }));
      
      const existingFarmers = await db.farmers.allDocs();
      await Promise.all(existingFarmers.rows.map(row => db.farmers.remove(row.id, row.value.rev)));
      await db.farmers.bulkDocs(bulkFarmers);
      
      // Sync recent collections (last 30 days)
      const date = new Date();
      date.setDate(date.getDate() - 30);
      const collectionsRes = await api.get(`/collections/report?date=${date.toISOString()}`);
      const collections = collectionsRes.data;
      
      const bulkCollections = collections.map((c: any) => ({
        ...c,
        _id: c.id || c._id
      }));
      
      const existingCollections = await db.collections.allDocs();
      await Promise.all(existingCollections.rows.map(row => db.collections.remove(row.id, row.value.rev)));
      await db.collections.bulkDocs(bulkCollections);
      
    } catch (error) {
      console.error('Failed to sync from server:', error);
    }
  }

  // --- Offline Read Methods ---
  async getFarmers() {
    const result = await db.farmers.allDocs({ include_docs: true });
    return result.rows.map(row => row.doc);
  }

  async getFarmerById(id: string) {
    try {
      return await db.farmers.get(id);
    } catch (e) {
      // Fallback to search by farmerId
      const result = await db.farmers.find({ selector: { farmerId: id } });
      return result.docs[0] || null;
    }
  }

  async searchFarmer(farmerId: string) {
    const result = await db.farmers.find({ selector: { farmerId } });
    return result.docs[0] || null;
  }

  async getCollectionsByDate(dateStr: string) {
    // Simple filter for now since date parsing in PouchDB find can be tricky
    const result = await db.collections.allDocs({ include_docs: true });
    return result.rows
      .map(row => row.doc as any)
      .filter(doc => doc.date && doc.date.startsWith(dateStr.split('T')[0]));
  }
}

export const offlineService = new OfflineService();

