import { useCallback } from 'react';
import { toast } from 'sonner';

export const useErrorHandler = () => {
  const handleError = useCallback((error: any, customMessage?: string) => {
    console.error('Error caught by handler:', error);
    
    let message = customMessage || 'An unexpected error occurred';
    
    if (typeof error === 'string') {
      message = error;
    } else if (error instanceof Error) {
      message = error.message;
    } else if (error?.response?.data?.message) {
      message = error.response.data.message;
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
