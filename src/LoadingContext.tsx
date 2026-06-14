import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { onLoadingChange } from './services/axiosInstance';

interface LoadingContextType {
  isLoading: boolean;
}

const LoadingContext = createContext<LoadingContextType | undefined>(undefined);

export const LoadingProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    return onLoadingChange((loading) => {
      setIsLoading(loading);
    });
  }, []);

  return (
    <LoadingContext.Provider value={{ isLoading }}>
      {children}
    </LoadingContext.Provider>
  );
};

export const useGlobalLoading = () => {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useGlobalLoading must be used within a LoadingProvider');
  }
  return context;
};
