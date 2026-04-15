import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capacitor-community/file-opener';
import { jsPDF } from 'jspdf';
import { toast } from 'sonner';

export const pdfService = {
  /**
   * Saves and opens a PDF document.
   * Handles both web (browser download) and native (filesystem save + open).
   */
  saveAndOpen: async (doc: jsPDF, fileName: string) => {
    try {
      if (!Capacitor.isNativePlatform()) {
        // Web: Standard browser download
        doc.save(fileName);
        return;
      }

      // Native (Android/iOS): Save to filesystem and open
      const pdfBase64 = doc.output('datauristring').split(',')[1];
      
      const savedFile = await Filesystem.writeFile({
        path: fileName,
        data: pdfBase64,
        directory: Directory.Documents,
        recursive: true
      });

      await FileOpener.open({
        filePath: savedFile.uri,
        contentType: 'application/pdf'
      });

      toast.success('PDF saved and opened');
    } catch (error) {
      console.error('PDF save/open failed:', error);
      toast.error('Failed to save or open PDF');
      
      // Fallback for native if file opener fails but save worked
      if (Capacitor.isNativePlatform()) {
        toast.info('PDF saved to Documents folder');
      }
    }
  }
};
