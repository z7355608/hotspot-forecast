/**
 * OnboardingContext — Module G
 * ============================
 * 全局引导状态管理，读写 localStorage，全局可访问。
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type UserRole = "creator" | "mcn" | "brand" | "visitor" | null;
export type UserGoal = "topics" | "viral" | "predict" | "explore" | null;

export interface ChecklistItem {
  id: string;
  label: string;
  done: boolean;
}

export interface OnboardingState {
  welcomeCompleted: boolean;
  userRole: UserRole;
  userPlatforms: string[];
  userGoal: UserGoal;
  checklistItems: ChecklistItem[];
  tooltipsSeen: Record<string, boolean>;
  newFeaturesSeen: Record<string, boolean>;
  creditsBannerDismissed: boolean;
}

interface OnboardingContextValue extends OnboardingState {
  completeWelcome: (role: UserRole, platforms: string[], goal: UserGoal) => void;
  markChecklistDone: (id: string) => void;
  markTooltipSeen: (id: string) => void;
  markFeatureSeen: (id: string) => void;
  dismissCreditsBanner: () => void;
  resetOnboarding: () => void;
}

/* ------------------------------------------------------------------ */
/*  Defaults                                                            */
/* ------------------------------------------------------------------ */

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { id: "welcome",    label: "完成基础配置",     done: false },
  { id: "first_query", label: "发起你的第一次分析", done: false },
  { id: "breakdown",  label: "体验爆款拆解",     done: false },
  { id: "prediction", label: "查看爆款预测",     done: false },
];

const STORAGE_KEY = "douhao_onboarding_v1";

function loadFromStorage(): OnboardingState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as OnboardingState;
  } catch {
    return null;
  }
}

function saveToStorage(state: OnboardingState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {/* ignore */}
}

function buildDefaultState(): OnboardingState {
  return {
    welcomeCompleted: false,
    userRole: null,
    userPlatforms: [],
    userGoal: null,
    checklistItems: DEFAULT_CHECKLIST,
    tooltipsSeen: {},
    newFeaturesSeen: {},
    creditsBannerDismissed: false,
  };
}

/* ------------------------------------------------------------------ */
/*  useTrack hook — Module G3                                           */
/* ------------------------------------------------------------------ */

export function useTrack() {
  return useCallback((eventName: string, payload?: Record<string, unknown>) => {
    // TODO: replace with real analytics SDK
    console.log("[douhao:track]", eventName, payload ?? {});
  }, []);
}

/* ------------------------------------------------------------------ */
/*  Context                                                             */
/* ------------------------------------------------------------------ */

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function OnboardingProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<OnboardingState>(() => {
    const saved = loadFromStorage();
    if (saved) {
      // Merge default checklist items in case new ones were added
      const existingIds = new Set(saved.checklistItems.map((i) => i.id));
      const merged = [
        ...saved.checklistItems,
        ...DEFAULT_CHECKLIST.filter((i) => !existingIds.has(i.id)),
      ];
      return { ...buildDefaultState(), ...saved, checklistItems: merged };
    }
    return buildDefaultState();
  });

  // Persist on every change
  useEffect(() => {
    saveToStorage(state);
  }, [state]);

  const completeWelcome = useCallback(
    (role: UserRole, platforms: string[], goal: UserGoal) => {
      setState((prev) => ({
        ...prev,
        welcomeCompleted: true,
        userRole: role,
        userPlatforms: platforms,
        userGoal: goal,
        checklistItems: prev.checklistItems.map((item) =>
          item.id === "welcome" ? { ...item, done: true } : item,
        ),
      }));
    },
    [],
  );

  const markChecklistDone = useCallback((id: string) => {
    setState((prev) => {
      const already = prev.checklistItems.find((i) => i.id === id)?.done;
      if (already) return prev;
      return {
        ...prev,
        checklistItems: prev.checklistItems.map((item) =>
          item.id === id ? { ...item, done: true } : item,
        ),
      };
    });
  }, []);

  const markTooltipSeen = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      tooltipsSeen: { ...prev.tooltipsSeen, [id]: true },
    }));
  }, []);

  const markFeatureSeen = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      newFeaturesSeen: { ...prev.newFeaturesSeen, [id]: true },
    }));
  }, []);

  const dismissCreditsBanner = useCallback(() => {
    setState((prev) => ({ ...prev, creditsBannerDismissed: true }));
  }, []);

  const resetOnboarding = useCallback(() => {
    const fresh = buildDefaultState();
    setState(fresh);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  const value = useMemo<OnboardingContextValue>(
    () => ({
      ...state,
      completeWelcome,
      markChecklistDone,
      markTooltipSeen,
      markFeatureSeen,
      dismissCreditsBanner,
      resetOnboarding,
    }),
    [
      state,
      completeWelcome,
      markChecklistDone,
      markTooltipSeen,
      markFeatureSeen,
      dismissCreditsBanner,
      resetOnboarding,
    ],
  );

  return (
    <OnboardingContext.Provider value={value}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be inside OnboardingProvider");
  return ctx;
}
