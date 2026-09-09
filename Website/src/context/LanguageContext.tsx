'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';

type Language = 'EN' | 'UR';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const translations: Record<Language, Record<string, string>> = {
  EN: {
    // Nav & Common
    app_title: 'SmartHaul',
    platform_tagline: 'Digital Heavy Freight Logistics Platform',
    dashboard: 'Dashboard',
    verifications: 'Verifications',
    shipments: 'Shipments',
    complaints: 'Complaints',
    users: 'Users',
    audit_logs: 'Audit Logs',
    announcements: 'Announcements',
    analytics: 'Analytics',
    fleet: 'Fleet',
    vehicles: 'Vehicles',
    drivers: 'Drivers',
    bids: 'Matched Bids',
    assignments: 'Assignments',
    live_map: 'Live Map',
    payments: 'Payments',
    reports: 'Reports',
    login: 'Log In',
    logout: 'Log Out',
    save: 'Save',
    cancel: 'Cancel',
    approve: 'Approve',
    reject: 'Reject',
    status: 'Status',
    actions: 'Actions',
    search: 'Search...',
    all: 'All',

    // Statuses
    PENDING: 'Pending',
    VERIFIED: 'Verified',
    REJECTED: 'Rejected',
    ACTIVE: 'Active',
    SUSPENDED: 'Suspended',
    BOOKED: 'Booked',
    REACHED_PICKUP: 'Reached Pickup',
    CARGO_LOADED: 'Cargo Loaded',
    IN_TRANSIT: 'In Transit',
    REACHED_DESTINATION: 'Reached Destination',
    DELIVERED: 'Delivered',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    PARTIAL: 'Partial',
    PAID: 'Paid',
  },
  UR: {
    // Nav & Common
    app_title: 'اسمارٹ ہال',
    platform_tagline: 'ہیوی فریٹ لاجسٹکس پلیٹ فارم',
    dashboard: 'ڈیش بورڈ',
    verifications: 'تصدیقی درخواستیں',
    shipments: 'کھیپ / ترسیلات',
    complaints: 'شکایات و تنازعات',
    users: 'صارفین',
    audit_logs: 'آڈٹ لاگز',
    announcements: 'اعلانات',
    analytics: 'اعداد و شمار',
    fleet: 'فلیٹ مینجمنٹ',
    vehicles: 'گاڑیاں',
    drivers: 'ڈرائیورز',
    bids: 'موزوں بولیاں',
    assignments: 'گاڑی و ڈرائیور تعیناتی',
    live_map: 'لائیو نقشہ',
    payments: 'ادائیگیاں',
    reports: 'رپورٹس',
    login: 'لاگ ان',
    logout: 'لاگ آؤٹ',
    save: 'محفوظ کریں',
    cancel: 'منسوخ کریں',
    approve: 'منظور کریں',
    reject: 'مسترد کریں',
    status: 'حالت',
    actions: 'کارروائی',
    search: 'تلاش کریں...',
    all: 'تمام',

    // Statuses
    PENDING: 'زیر التواء',
    VERIFIED: 'تصدیق شدہ',
    REJECTED: 'مسترد',
    ACTIVE: 'فعال',
    SUSPENDED: 'معطل',
    BOOKED: 'بک شدہ',
    REACHED_PICKUP: 'پک اپ پر پہنچ گیا',
    CARGO_LOADED: 'سامان لوڈ ہو گیا',
    IN_TRANSIT: 'راستے میں',
    REACHED_DESTINATION: 'منزل پر پہنچ گیا',
    DELIVERED: 'ڈیلیور ہو گیا',
    COMPLETED: 'مکمل',
    CANCELLED: 'منسوخ شدہ',
    PARTIAL: 'جزوی ادا شدہ',
    PAID: 'مکمل ادا شدہ',
  },
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'EN',
  setLanguage: () => {},
  t: (key) => key,
  isRTL: false,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>('EN');

  useEffect(() => {
    const saved = localStorage.getItem('smarthaul_lang') as Language;
    if (saved && (saved === 'EN' || saved === 'UR')) {
      setLanguageState(saved);
      document.documentElement.dir = saved === 'UR' ? 'rtl' : 'ltr';
      document.documentElement.lang = saved.toLowerCase();
    }
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('smarthaul_lang', lang);
    document.documentElement.dir = lang === 'UR' ? 'rtl' : 'ltr';
    document.documentElement.lang = lang.toLowerCase();
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  const isRTL = language === 'UR';

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
