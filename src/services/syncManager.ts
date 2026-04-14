import { Network } from '@capacitor/network';
import { db } from './localDb';
import api from './api';

class SyncManager {
  private isSyncing = false;

  constructor() {
    this.setupNetworkListener();
  }

  private async setupNetworkListener() {
    Network.addListener('networkStatusChange', async (status) => {
      console.log('Network status changed', status);
      if (status.connected) {
        await this.sync();
      }
    });
  }

  async sync() {
    if (this.isSyncing) return;
    
    const status = await Network.getStatus();
    if (!status.connected) return;

    this.isSyncing = true;
    try {
      console.log('Starting sync process...');
      await this.pushLocalChanges();
      await this.pullServerChanges();
      console.log('Sync process completed successfully.');
    } catch (error) {
      console.error('Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
  }

  async clearLocalData() {
    await db.farmers.clear();
    await db.collections.clear();
    await db.rateCharts.clear();
    await db.rateSettings.clear();
    await db.ledger.clear();
    await db.syncQueue.clear();
  }

  private async pushLocalChanges() {
    const pendingItems = await db.syncQueue.where('status').equals('PENDING').toArray();
    
    for (const item of pendingItems) {
      try {
        switch (item.entity) {
          case 'FARMER':
            if (item.action === 'CREATE') await api.post('/farmers', item.data);
            else if (item.action === 'UPDATE') await api.put(`/farmers/${item.data.id}`, item.data);
            else if (item.action === 'DELETE') await api.delete(`/farmers/${item.data.id}`);
            break;
          case 'COLLECTION':
            if (item.action === 'CREATE') await api.post('/collections', item.data);
            break;
          case 'PAYMENT':
            if (item.action === 'CREATE') await api.post('/payments', item.data);
            break;
          case 'RATE_CHART':
            if (item.action === 'CREATE') await api.post('/rates', item.data);
            else if (item.action === 'UPDATE') await api.put(`/rates/${item.data.id}`, item.data);
            else if (item.action === 'DELETE') await api.delete(`/rates/${item.data.id}`);
            break;
          case 'RATE_SETTINGS':
            if (item.action === 'CREATE' || item.action === 'UPDATE') await api.post('/rates/settings', item.data);
            break;
        }
        
        // Remove from queue on success
        if (item.id) await db.syncQueue.delete(item.id);
      } catch (error: any) {
        console.error(`Failed to sync item ${item.id}:`, error);
        if (item.id) {
          await db.syncQueue.update(item.id, { 
            status: 'FAILED', 
            error: error.message 
          });
        }
      }
    }
  }

  private async pullServerChanges() {
    const dairyId = localStorage.getItem('databaseId') || '';
    if (!dairyId) return;

    try {
      // Pull Farmers
      const farmersRes = await api.get('/farmers');
      if (farmersRes.data && Array.isArray(farmersRes.data)) {
        const data = farmersRes.data.map((item: any) => ({ ...item, dairyId }));
        await db.farmers.bulkPut(data);
      }

      // Pull Rate Charts
      const ratesRes = await api.get('/rates');
      if (ratesRes.data && Array.isArray(ratesRes.data)) {
        const data = ratesRes.data.map((item: any) => ({ ...item, dairyId }));
        await db.rateCharts.bulkPut(data);
      }

      // Pull Rate Settings
      const settingsRes = await api.get('/rates/settings');
      if (settingsRes.data && Object.keys(settingsRes.data).length > 0) {
        await db.rateSettings.put({ id: 'default', ...settingsRes.data, dairyId });
      }

      // Pull Ledger
      const ledgerRes = await api.get('/ledger');
      if (ledgerRes.data && Array.isArray(ledgerRes.data)) {
        const data = ledgerRes.data.map((item: any) => ({ ...item, dairyId }));
        await db.ledger.bulkPut(data);
      }

      // Pull Collections (Everything)
      const collectionsRes = await api.get('/collections/report');
      if (collectionsRes.data && Array.isArray(collectionsRes.data)) {
        const data = collectionsRes.data.map((item: any) => ({ ...item, dairyId }));
        await db.collections.bulkPut(data);
      }

    } catch (error) {
      console.error('Failed to pull server changes:', error);
    }
  }
}

export const syncManager = new SyncManager();
