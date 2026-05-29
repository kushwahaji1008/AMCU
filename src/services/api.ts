import { offlineService } from './offlineService';

const wrap = (data: any) => Promise.resolve({ data });

export const farmerApi = {
  getFarmers: () => offlineService.getFarmers().then(wrap),
  getAll: (params?: any) => offlineService.getFarmers().then(wrap),
  getFarmerById: (id: string) => offlineService.getFarmerById(id).then(wrap),
  getById: (id: string) => offlineService.getFarmerById(id).then(wrap),
  searchFarmer: (id: string) => offlineService.searchFarmer(id).then(wrap),
  search: (id: string) => offlineService.searchFarmer(id).then(wrap),
  createFarmer: (data: any) => offlineService.createFarmer(data).then(wrap),
  create: (data: any) => offlineService.createFarmer(data).then(wrap),
  updateFarmer: (id: string, data: any) => offlineService.updateFarmer(id, data).then(wrap),
  update: (id: string, data: any) => offlineService.updateFarmer(id, data).then(wrap),
  deleteFarmer: (id: string) => offlineService.deleteFarmer(id).then(wrap),
  delete: (id: string) => offlineService.deleteFarmer(id).then(wrap),
};

export const collectionApi = {
  getCollections: (date: string, endDate?: string) => offlineService.getCollectionsByDate(date, endDate).then(wrap),
  getReport: (date: string, endDate?: string) => offlineService.getCollectionsByDate(date, endDate).then(wrap),
  getDailyReport: (date: string) => offlineService.getCollectionsByDate(date).then(wrap),
  getByFarmerId: (id: string) => wrap([]),
  recordCollection: (data: any) => offlineService.createCollection(data).then(wrap),
  create: (data: any) => offlineService.createCollection(data).then(wrap),
  deleteCollection: () => wrap({}),
  updateCollection: (id: string, data: any) => wrap({}),
  update: (id: string, data: any) => wrap({}),
};

export const shiftApi = {
  getRecentShifts: (limit?: number) => offlineService.getRecentShifts(limit).then(wrap),
  getRecent: (limit?: number) => offlineService.getRecentShifts(limit).then(wrap),
  getShiftSummary: (date: string, shift: string) => offlineService.getShiftSummaryOffline(date, shift).then(wrap),
  getSummary: (date: string, shift: string) => offlineService.getShiftSummaryOffline(date, shift).then(wrap),
  createSummary: (data: any) => wrap(data),
};

export const paymentApi = {
  getLedger: () => offlineService.getLedger().then(wrap),
  getLedgerByFarmerId: (id: string) => offlineService.getLedgerByFarmerId(id).then(wrap),
  recordPayment: (data: any) => offlineService.recordPaymentOffline(data).then(wrap),
};

export const reportApi = {
  getDashboard: () => offlineService.getDashboardOffline().then(wrap),
  getBills: (year: number, month: number, period: number, farmerId?: string) => offlineService.getBillsOffline(year, month, period, farmerId).then(wrap),
  finalizeBills: (data: any) => wrap({}),
};

export const rateApi = {
  getRates: () => offlineService.getRates().then(wrap),
  getAll: () => offlineService.getRates().then(wrap),
  create: (data: any) => wrap({}),
  delete: (id: string) => wrap({}),
  getRateSettings: () => offlineService.getRateSettings().then(wrap),
  getSettings: () => offlineService.getRateSettings().then(wrap),
  saveRateSettings: (data: any) => offlineService.saveRateSettings(data).then(wrap),
  saveSettings: (data: any) => offlineService.saveRateSettings(data).then(wrap),
};

export const dairyApi = {
  getDairies: () => offlineService.getDairies().then(wrap),
  getAll: (params?: any) => offlineService.getDairies().then(wrap),
  updateDairy: (id: string, data: any) => wrap({}),
  update: (id: string, data: any) => wrap({}),
};

export const userApi = {
  getUsers: () => offlineService.getUsers().then(wrap),
  getAll: (params?: any) => offlineService.getUsers().then(wrap),
  create: (data: any) => wrap({}),
  update: (id: string, data: any) => wrap({}),
  delete: (id: string) => wrap({}),
};

export const authApi = {
  login: (data: any) => wrap({ token: 'mock-token', user: { id: 'local', username: data.username, role: 'admin' }, requiresOTP: false }),
  verifyAdmin: (data: any) => wrap({ token: 'mock-token', user: { id: 'local', username: data.email, role: 'admin' }, requiresOTP: false }),
  register: (data: any) => wrap({}),
};

export const adminApi = {
  someAdminMethod: () => wrap(null),
  getSwaggerStatus: () => wrap({ swaggerEnabled: false }),
  toggleSwagger: (enabled?: boolean) => wrap({ swaggerEnabled: false }),
};

export default {
  get: (url: string, params?: any) => wrap([]),
  post: (url: string, data?: any) => wrap({}),
  put: (url: string, data?: any) => wrap({}),
  delete: (url: string) => wrap({}),
};
