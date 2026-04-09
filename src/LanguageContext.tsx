import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'en' | 'hi';

interface Translations {
  [key: string]: {
    en: string;
    hi: string;
  };
}

const translations: Translations = {
  dashboard: { en: 'Dashboard', hi: 'डैशबोर्ड' },
  collection: { en: 'Collection', hi: 'संग्रह' },
  farmers: { en: 'Farmers', hi: 'किसान' },
  reports: { en: 'Reports', hi: 'रिपोर्ट' },
  settings: { en: 'Settings', hi: 'सेटिंग्स' },
  login: { en: 'Login', hi: 'लॉगिन' },
  username: { en: 'Username', hi: 'उपयोगकर्ता नाम' },
  password: { en: 'Password', hi: 'पासवर्ड' },
  language: { en: 'Language', hi: 'भाषा' },
  welcome: { en: 'Welcome to DugdhaSetu', hi: 'दुग्धसेतु में आपका स्वागत है' },
  milkCollection: { en: 'Milk Collection', hi: 'दूध संग्रह' },
  qualityTesting: { en: 'Quality Testing', hi: 'गुणवत्ता परीक्षण' },
  shifts: { en: 'Shifts', hi: 'शिफ्ट' },
  rateCharts: { en: 'Rate Charts', hi: 'दर चार्ट' },
  receipts: { en: 'Receipts', hi: 'रसीदें' },
  payments: { en: 'Payments', hi: 'भुगतान' },
  devices: { en: 'Devices', hi: 'उपकरण' },
  sync: { en: 'Sync', hi: 'सिंक' },
  users: { en: 'Users', hi: 'उपयोगकर्ता' },
  auditLog: { en: 'Audit Log', hi: 'ऑडिट लॉग' },
  backup: { en: 'Backup', hi: 'बैकअप' },
  help: { en: 'Help', hi: 'सहायता' },
  signOut: { en: 'Sign Out', hi: 'साइन आउट' },
  ledger: { en: 'Ledger', hi: 'लेजर' },
  bills: { en: 'Bills', hi: 'बिल' },
  morning: { en: 'Morning', hi: 'सुबह' },
  evening: { en: 'Evening', hi: 'शाम' },
  quantity: { en: 'Quantity', hi: 'मात्रा' },
  fat: { en: 'FAT', hi: 'वसा' },
  snf: { en: 'SNF', hi: 'एसएनएफ' },
  amount: { en: 'Amount', hi: 'राशि' },
  rate: { en: 'Rate', hi: 'दर' },
  save: { en: 'Save', hi: 'सहेजें' },
  search: { en: 'Search', hi: 'खोजें' },
  cancel: { en: 'Cancel', hi: 'रद्द करें' },
  approve: { en: 'Approve', hi: 'स्वीकार करें' },
  reject: { en: 'Reject', hi: 'अस्वीकार करें' },
};

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const saved = localStorage.getItem('dugdhasetu_lang');
    return (saved as Language) || 'en';
  });

  useEffect(() => {
    localStorage.setItem('dugdhasetu_lang', language);
  }, [language]);

  const t = (key: string) => {
    return translations[key]?.[language] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
