import { useCallback } from 'react';
import { toast } from 'sonner';

export const useErrorHandler = () => {
  const handleError = useCallback((error: any, customMessage?: string) => {
    console.error('Error caught by handler:', error);
    
    let message = customMessage || 'An unexpected error occurred';
    
    if (typeof error === 'string') {
      message = error;
    } else if (error?.response?.data) {
      const data = error.response.data;
      if (typeof data === 'string') {
        message = data;
      } else if (data.message) {
        message = data.message;
      } else if (data.errors && Array.isArray(data.errors)) {
        message = data.errors.map((e: any) => e.msg || e.message).join(', ');
      } else if (error.message) {
        message = error.message;
      }
    } else if (error instanceof Error) {
      message = error.message;
    } else if (error?.message) {
      message = error.message;
    }

    toast.error(message, {
      description: error?.status ? `Error Code: ${error.status}` : undefined,
    });

    return message;
  }, []);

  return { handleError };
};
