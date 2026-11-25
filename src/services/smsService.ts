import { SmsSender } from 'capacitor-sms-sender';
import { isNativeApp } from './platform';
import { sqliteDb, PersistedSmsRecord, SmsDeliveryStatus } from './sqliteDatabase';
import { offlineService } from './offlineService';
import { smsLogApi } from './api';

export interface SimInfo {
  slotIndex: number;
  subscriptionId: number;
  carrierName: string;
  displayName?: string;
}

export interface SendDirectSmsOptions {
  recipientType?: 'farmer' | 'customer' | 'other';
  recipientId?: string;
  recipientName?: string;
  triggerType?: string;
  idempotencyKey?: string;
  simSlot?: number;
}

export interface SendSmsResult {
  success: boolean;
  status: SmsDeliveryStatus;
  messageId?: string;
  queued?: boolean;
  simulated?: boolean;
  message?: string;
}

const SIM_PREF_KEY = 'dugdhasetu_preferred_sim';
let statusListenerRegistered = false;
let processingSmsQueue = false;

function normalizePhone(phoneNumber: string): string {
  const cleaned = String(phoneNumber || '').replace(/[^\d+]/g, '');
  if (/^\d{10}$/.test(cleaned)) {
    return `+91${cleaned}`;
  }
  return cleaned;
}

function generateId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    // Fallback
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function nextNumericSmsId(): number {
  return Math.floor(100000 + Math.random() * 899999999);
}

function ensureStatusListenerRegistered() {
  if (!isNativeApp() || statusListenerRegistered) return;
  statusListenerRegistered = true;
  try {
    SmsSender.addListener('smsSenderStatusUpdated', async (result) => {
      if (!sqliteDb.isEnabled() || !result?.id) return;
      const numericId = String(result.id);
      const rawStatus = String(result.status || '').toUpperCase();
      let mappedStatus: SmsDeliveryStatus = 'submitted';
      if (rawStatus === 'SENT') mappedStatus = 'sent';
      else if (rawStatus === 'DELIVERED') mappedStatus = 'delivered';
      else if (rawStatus === 'FAILED') mappedStatus = 'failed';
      else if (rawStatus === 'PENDING') mappedStatus = 'submitted';

      const now = Date.now();
      const updated = await sqliteDb.updateSmsStatus(numericId, {
        status: mappedStatus,
        sentAt: mappedStatus === 'sent' ? now : undefined,
        deliveredAt: mappedStatus === 'delivered' ? now : undefined,
        errorMessage: mappedStatus === 'failed' ? 'Carrier reported delivery failure' : undefined,
        syncedToServer: false,
      });

      if (updated && offlineService.isOnline) {
        void syncSingleSmsLogToServer(updated);
      }
      await offlineService.refreshSyncStatus();
    });
  } catch (err) {
    statusListenerRegistered = false;
    console.warn('[SmsService] Failed to attach status listener:', err);
  }
}

async function syncSingleSmsLogToServer(record: PersistedSmsRecord): Promise<void> {
  if (!offlineService.isOnline) return;
  const token = typeof localStorage !== 'undefined' ? localStorage.getItem('token') : null;
  if (token && token.startsWith('offline_token_')) return;

  try {
    await smsLogApi.recordLog({
      idempotencyKey: record.idempotencyKey,
      recipientType: record.recipientType,
      recipientId: record.recipientId,
      recipientName: record.recipientName,
      phone: record.phone,
      message: record.message,
      triggerType: record.triggerType,
      deliveryChannel: record.deliveryChannel,
      status: record.status,
      attempts: record.attempts,
      providerMessageId: record.providerMessageId,
      errorMessage: record.errorMessage,
      simSlot: record.simSlot,
      sentAt: record.sentAt ? new Date(record.sentAt).toISOString() : undefined,
      deliveredAt: record.deliveredAt ? new Date(record.deliveredAt).toISOString() : undefined,
      createdAt: new Date(record.createdAt).toISOString(),
    });
    if (sqliteDb.isEnabled()) {
      await sqliteDb.updateSmsStatus(record.id, { syncedToServer: true });
    }
  } catch {
    // Will retry later via flushSmsLogsToServer()
  }
}

export const smsService = {
  getPreferredSimSlot(): number {
    if (typeof localStorage === 'undefined') return 0;
    const raw = localStorage.getItem(SIM_PREF_KEY);
    const parsed = raw !== null ? parseInt(raw, 10) : 0;
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  },

  setPreferredSimSlot(slotIndex: number): void {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SIM_PREF_KEY, String(Math.max(0, Math.floor(slotIndex))));
  },

  async getAvailableSims(): Promise<SimInfo[]> {
    if (!isNativeApp()) return [];
    try {
      const pluginAny = SmsSender as any;
      if (typeof pluginAny.getAvailableSims === 'function') {
        const res = await pluginAny.getAvailableSims();
        return Array.isArray(res?.sims) ? res.sims : [];
      }
    } catch (err) {
      console.warn('[SmsService] Failed to query SIM slots:', err);
    }
    return [];
  },

  async ensureSmsPermission(): Promise<{ granted: boolean; message?: string }> {
    if (!isNativeApp()) return { granted: true };
    try {
      const check = await SmsSender.checkPermissions();
      if (check?.send_sms === 'granted') {
        return { granted: true };
      }
      const req = await SmsSender.requestPermissions();
      if (req?.send_sms === 'granted') {
        return { granted: true };
      }
      return {
        granted: false,
        message: 'SEND_SMS permission denied. Allow SMS permission in Android App Settings.',
      };
    } catch (err: any) {
      return { granted: false, message: err?.message || 'Unable to verify SMS permission' };
    }
  },

  /**
   * Sends an SMS directly from the Android device's SIM on native builds, with SQLite queueing,
   * multipart Unicode support, deduplication, and delivery status tracking.
   * On Website, simulates SMS cleanly without creating offline queues.
   */
  sendDirectSMS: async (
    phoneNumber: string,
    message: string,
    options: SendDirectSmsOptions = {}
  ): Promise<SendSmsResult> => {
    const normalizedPhone = normalizePhone(phoneNumber);
    const recipientType = options.recipientType || 'other';
    const triggerType = options.triggerType || 'manual';
    const idempotencyKey =
      options.idempotencyKey ||
      `sms_${triggerType}_${options.recipientId || normalizedPhone}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    if (!normalizedPhone || normalizedPhone.replace(/\D/g, '').length < 8) {
      return {
        success: false,
        status: 'failed',
        message: 'Invalid or missing recipient mobile number.',
      };
    }

    // Website mode: strictly online-only, never initializes SQLite sms_queue
    if (!sqliteDb.isEnabled() && !isNativeApp()) {
      console.log(`[SIMULATED SMS (Web)] To: ${normalizedPhone}, Message: ${message}`);
      if (offlineService.isOnline) {
        void smsLogApi
          .recordLog({
            idempotencyKey,
            recipientType,
            recipientId: options.recipientId,
            recipientName: options.recipientName,
            phone: normalizedPhone,
            message,
            triggerType,
            deliveryChannel: 'server_simulated',
            status: 'simulated',
            attempts: 1,
          })
          .catch(() => {});
      }
      return {
        success: true,
        status: 'simulated',
        simulated: true,
        message: 'Simulated in web browser (device SIM SMS requires Android APK)',
      };
    }

    await sqliteDb.init();
    ensureStatusListenerRegistered();

    const simSlot = options.simSlot ?? smsService.getPreferredSimSlot();
    const numericId = nextNumericSmsId();
    const smsLocalId = generateId('sms');

    const { inserted } = await sqliteDb.enqueueSms({
      id: smsLocalId,
      idempotencyKey,
      recipientType,
      recipientId: options.recipientId,
      recipientName: options.recipientName,
      phone: normalizedPhone,
      message,
      triggerType,
      deliveryChannel: 'native_sim',
      status: 'queued',
      attempts: 0,
      nextRetryAt: 0,
      simSlot,
      providerMessageId: String(numericId),
    });

    if (!inserted) {
      const existingList = await sqliteDb.getSmsQueue(50);
      const existing = existingList.find((item) => item.idempotencyKey === idempotencyKey);
      if (existing && (existing.status === 'submitted' || existing.status === 'sent' || existing.status === 'delivered')) {
        return {
          success: true,
          status: existing.status,
          messageId: existing.id,
          message: 'SMS already dispatched (deduplicated)',
        };
      }
    }

    const perm = await smsService.ensureSmsPermission();
    if (!perm.granted) {
      const updated = await sqliteDb.updateSmsStatus(idempotencyKey, {
        status: 'failed',
        attempts: 1,
        nextRetryAt: Number.MAX_SAFE_INTEGER,
        errorMessage: perm.message || 'SMS permission denied',
        syncedToServer: false,
      });
      await offlineService.recordAuditEvent({
        action: 'SMS_PERMISSION_DENIED',
        targetId: smsLocalId,
        targetType: 'SMS',
        details: { phone: normalizedPhone, triggerType },
        operationStatus: 'failure',
        errorDetails: perm.message,
      });
      if (updated && offlineService.isOnline) {
        void syncSingleSmsLogToServer(updated);
      }
      await offlineService.refreshSyncStatus();
      return {
        success: false,
        status: 'failed',
        messageId: smsLocalId,
        message: perm.message || 'SMS permission denied',
      };
    }

    return await smsService.dispatchNativeSmsRecord(
      idempotencyKey,
      numericId,
      normalizedPhone,
      message,
      simSlot,
      1
    );
  },

  async dispatchNativeSmsRecord(
    idempotencyKey: string,
    numericId: number,
    phone: string,
    text: string,
    simSlot: number,
    attemptNumber: number
  ): Promise<SendSmsResult> {
    try {
      const result = await SmsSender.send({
        id: numericId,
        phone,
        text,
        sim: simSlot,
      });

      const raw = String(result?.status || '').toUpperCase();
      const status: SmsDeliveryStatus =
        raw === 'DELIVERED' ? 'delivered' : raw === 'SENT' ? 'sent' : raw === 'FAILED' ? 'failed' : 'submitted';

      const updated = await sqliteDb.updateSmsStatus(idempotencyKey, {
        status,
        attempts: attemptNumber,
        providerMessageId: String(result?.id ?? numericId),
        simSlot,
        errorMessage: status === 'failed' ? 'Native SMS plugin returned FAILED' : undefined,
        sentAt: status === 'sent' || status === 'submitted' ? Date.now() : undefined,
        deliveredAt: status === 'delivered' ? Date.now() : undefined,
        syncedToServer: false,
      });

      await offlineService.recordAuditEvent({
        action: `SMS_${status.toUpperCase()}`,
        targetId: updated?.id || idempotencyKey,
        targetType: 'SMS',
        details: { phone, simSlot, providerMessageId: result?.id ?? numericId, attempt: attemptNumber },
        operationStatus: status === 'failed' ? 'failure' : 'success',
        syncStatus: offlineService.isOnline ? 'online' : 'queued_offline',
      });

      if (updated && offlineService.isOnline) {
        void syncSingleSmsLogToServer(updated);
      }
      await offlineService.refreshSyncStatus();

      return {
        success: status !== 'failed',
        status,
        messageId: updated?.id || idempotencyKey,
      };
    } catch (error: any) {
      const errMsg = error?.message || 'Native SIM send failed';
      const backoffMs = Math.min(10 * 60 * 1000, 30000 * attemptNumber);
      const updated = await sqliteDb.updateSmsStatus(idempotencyKey, {
        status: 'failed',
        attempts: attemptNumber,
        nextRetryAt: attemptNumber < 3 ? Date.now() + backoffMs : Number.MAX_SAFE_INTEGER,
        errorMessage: errMsg,
        syncedToServer: false,
      });

      await offlineService.recordAuditEvent({
        action: 'SMS_SEND_FAILED',
        targetId: updated?.id || idempotencyKey,
        targetType: 'SMS',
        details: { phone, simSlot, attempt: attemptNumber },
        operationStatus: 'failure',
        errorDetails: errMsg,
        syncStatus: 'queued_offline',
      });

      if (updated && offlineService.isOnline) {
        void syncSingleSmsLogToServer(updated);
      }
      await offlineService.refreshSyncStatus();

      return {
        success: false,
        status: 'failed',
        queued: attemptNumber < 3,
        messageId: updated?.id || idempotencyKey,
        message: errMsg,
      };
    }
  },

  async retryQueuedSms(manualForce: boolean = false): Promise<number> {
    if (!sqliteDb.isEnabled() || processingSmsQueue) return 0;
    processingSmsQueue = true;
    let retried = 0;

    try {
      ensureStatusListenerRegistered();
      if (isNativeApp()) {
        const perm = await smsService.ensureSmsPermission();
        if (perm.granted) {
          const candidates = manualForce
            ? (await sqliteDb.getSmsQueue(100)).filter((s) => s.status === 'queued' || s.status === 'failed')
            : await sqliteDb.getRetryableSms(Date.now());

          for (const item of candidates) {
            const numericId = nextNumericSmsId();
            await smsService.dispatchNativeSmsRecord(
              item.idempotencyKey,
              numericId,
              item.phone,
              item.message,
              item.simSlot ?? smsService.getPreferredSimSlot(),
              item.attempts + 1
            );
            retried++;
          }
        }
      }

      if (offlineService.isOnline) {
        const unsynced = await sqliteDb.getUnsyncedSmsLogs(50);
        for (const rec of unsynced) {
          await syncSingleSmsLogToServer(rec);
        }
      }
    } finally {
      processingSmsQueue = false;
      await offlineService.refreshSyncStatus();
    }
    return retried;
  },

  async getLocalSmsHistory(limit: number = 100): Promise<PersistedSmsRecord[]> {
    if (!sqliteDb.isEnabled()) return [];
    await sqliteDb.init();
    return await sqliteDb.getSmsQueue(limit);
  },
};

offlineService.setSmsFlushHandler(async () => {
  await smsService.retryQueuedSms(false);
});
