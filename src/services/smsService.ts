import { SmsSender } from 'capacitor-sms-sender';
import { Capacitor } from '@capacitor/core';

/**
 * Service to handle SMS sending via the device's SIM carrier.
 * Uses capacitor-sms-sender plugin.
 */
export const smsService = {
  /**
   * Requests SMS permissions from the user.
   * @returns Promise<boolean> True if permission granted, false otherwise.
   */
  requestPermissions: async (): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) {
      console.warn('SMS permissions can only be requested on native platforms.');
      return false;
    }

    try {
      const permission = await SmsSender.requestPermissions();
      return permission.send_sms === 'granted';
    } catch (error) {
      console.error('Error requesting SMS permissions:', error);
      return false;
    }
  },

  /**
   * Sends an SMS message to a specific number.
   * @param phoneNumber The recipient's phone number.
   * @param message The message content.
   * @param simSlot Optional SIM slot index (0 or 1). Defaults to 0.
   */
  sendSMS: async (phoneNumber: string, message: string, simSlot: number = 0): Promise<void> => {
    if (!Capacitor.isNativePlatform()) {
      console.info(`[WEB SIMULATION] SMS to ${phoneNumber}: ${message}`);
      return;
    }

    try {
      const hasPermission = await smsService.requestPermissions();
      if (!hasPermission) {
        throw new Error('SMS permission not granted');
      }

      await SmsSender.send({
        id: Math.floor(Math.random() * 1000000),
        sim: simSlot,
        phone: phoneNumber,
        text: message
      });
      
      console.log(`SMS sent successfully to ${phoneNumber}`);
    } catch (error) {
      console.error('Failed to send SMS:', error);
      throw error;
    }
  }
};
