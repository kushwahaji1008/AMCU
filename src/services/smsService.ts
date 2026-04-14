import { Capacitor } from '@capacitor/core';
import { SmsSender } from 'capacitor-sms-sender';

export const smsService = {
  /**
   * Sends an SMS directly using the device's SIM card in the background.
   * Only works on Android native devices with SEND_SMS permission.
   */
  sendDirectSMS: async (phoneNumber: string, message: string): Promise<{ success: boolean; message?: string }> => {
    if (!Capacitor.isNativePlatform()) {
      console.log(`[SIMULATED SMS] To: ${phoneNumber}, Message: ${message}`);
      return { success: true, message: 'Simulated on web' };
    }

    try {
      // Check for permissions
      const permission = await SmsSender.checkPermissions();
      if (permission.send_sms !== 'granted') {
        const request = await SmsSender.requestPermissions();
        if (request.send_sms !== 'granted') {
          return { success: false, message: 'SMS permission denied' };
        }
      }

      // Send SMS
      await SmsSender.send({
        id: Math.floor(Math.random() * 1000000),
        phone: phoneNumber,
        text: message,
        sim: 0 // 0 is usually the default SIM
      });
      
      return { success: true };
    } catch (error: any) {
      console.error('Failed to send SMS:', error);
      return { success: false, message: error.message || 'Failed to send SMS' };
    }
  }
};
