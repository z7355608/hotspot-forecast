import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/_core/hooks/useAuth";

type AuthModalView = "closed" | "welcome" | "login";

type AuthModalContextValue = {
  view: AuthModalView;
  setView: (view: AuthModalView) => void;
  openLogin: () => void;
  openWelcome: () => void;
  close: () => void;
};

const AuthModalContext = createContext<AuthModalContextValue | null>(null);

export function AuthModalProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth({ mode: "modal" });
  const [view, setView] = useState<AuthModalView>("closed");

  // Auto-open welcome on initial unauth, auto-close once authenticated.
  // This effect is the single source of truth for view changes driven by auth state —
  // form components must NOT manually setView('closed') on login success.
  useEffect(() => {
    if (loading) return;
    if (!user) {
      setView((prev) => (prev === "closed" ? "welcome" : prev));
    } else {
      setView("closed");
    }
  }, [loading, user]);

  const openLogin = useCallback(() => setView("login"), []);
  const openWelcome = useCallback(() => setView("welcome"), []);
  const close = useCallback(() => setView("closed"), []);

  const value = useMemo<AuthModalContextValue>(
    () => ({ view, setView, openLogin, openWelcome, close }),
    [view, openLogin, openWelcome, close]
  );

  return <AuthModalContext.Provider value={value}>{children}</AuthModalContext.Provider>;
}

export function useAuthModal() {
  const ctx = useContext(AuthModalContext);
  if (!ctx) throw new Error("useAuthModal must be used within AuthModalProvider");
  return ctx;
}
