import { create } from 'zustand';

export interface LocaleInfo {
  code: string;
  label: string;
  nativeLabel: string;
}

interface LocaleState {
  catalog: LocaleInfo[];
  enabled: string[];
  defaultLocale: string;
  ready: boolean;
  set: (data: { catalog: LocaleInfo[]; enabled: string[]; defaultLocale: string }) => void;
}

export const useLocaleStore = create<LocaleState>((set) => ({
  catalog: [],
  enabled: ['es'],
  defaultLocale: 'es',
  ready: false,
  set: (data) => set({ ...data, ready: true }),
}));
