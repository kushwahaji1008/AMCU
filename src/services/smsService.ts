import { Capacitor } from '@capacitor/core';
import { SmsSender } from 'capacitor-sms-sender';

export const smsService = {
  /**
   * Sends an SMS directly using the device's SIM card.
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
      if (permission.sms !== 'granted') {
        const request = await SmsSender.requestPermissions();
        if (request.sms !== 'granted') {
          return { success: false, message: 'SMS permission denied' };
        }
      }

      // Send SMS
      await SmsSender.sendSms({
        phoneNumber: phoneNumber,
        message: message,
        simId: 0 // 0 is usually the default SIM
      });
      
      return { success: true };
    } catch (error: any) {
      console.error('Failed to send SMS:', error);
      return { success: false, message: error.message || 'Failed to send SMS' };
    }
  }
};
