'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SupportedLanguage } from '@/i18n/resources';

interface PreferencesState {
  language: SupportedLanguage;
}

const initialPreferencesState: PreferencesState = {
  language: 'ko',
};

export const usePreferencesStore = create<PreferencesState>()(
  persist(() => initialPreferencesState, {
    name: 'full-template-preferences',
    storage: createJSONStorage(() => localStorage),
    skipHydration: true,
  }),
);

export const preferencesGet = {
  language: () => usePreferencesStore.getState().language,
};

export const preferencesSet = {
  language: (language: SupportedLanguage) =>
    usePreferencesStore.setState({ language }),
};

export const preferencesHook = {
  useLanguage: () => usePreferencesStore((state) => state.language),
};
