"use client";
import { create } from "zustand";
interface AuthState {
  accessToken: string;
  hydrated: boolean;
  revision: number;
}
const initial = { accessToken: "", hydrated: false, revision: 0 };
const useAuthStore = create<AuthState>(() => initial);
export const authGet = {
  accessToken: () => useAuthStore.getState().accessToken,
  revision: () => useAuthStore.getState().revision,
  hydrated: () => useAuthStore.getState().hydrated,
};
export const authSet = {
  accessToken: (accessToken: string) =>
    useAuthStore.setState({ accessToken, hydrated: true }),
  reset: () =>
    useAuthStore.setState((s) => ({
      accessToken: "",
      hydrated: true,
      revision: s.revision + 1,
    })),
  session: (accessToken: string) =>
    useAuthStore.setState((s) => ({
      accessToken,
      hydrated: true,
      revision: s.revision + 1,
    })),
};
export const authHook = {
  useAccessToken: () => ({ accessToken: useAuthStore((s) => s.accessToken) }),
  useAuth: () => useAuthStore(),
};
