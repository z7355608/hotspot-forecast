import { useState } from "react";
import { Outlet, useLocation, useNavigation } from "react-router-dom";
import { useAuth } from "@/_core/hooks/useAuth";
import { Header } from "./Header";
import {
  CreditsQuickModal,
  InviteFriendsModal,
  NotificationsModal,
} from "./QuickAccessModals";
import { MobileNavDrawer, Sidebar } from "./Sidebar";
import { OnboardingProvider, useOnboarding } from "../lib/onboarding-context";
import { WelcomeFlow } from "./onboarding/WelcomeFlow";
import { ChecklistCard } from "./onboarding/ChecklistCard";
import { AuthModalProvider } from "./auth/auth-modal-context";
import { LoginModal } from "./auth/LoginModal";
import { WelcomeTrialModal } from "./auth/WelcomeTrialModal";

function AuthLoadingSkeleton() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-200 border-t-gray-800" />
        <p className="text-sm text-gray-500">正在验证登录状态...</p>
      </div>
    </div>
  );
}

/** Inner shell — needs OnboardingProvider above it */
function AppShell() {
  const navigation = useNavigation();
  const location = useLocation();
  const isNavigating = navigation.state === "loading";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const { user, loading } = useAuth({ mode: "modal" });
  const { welcomeCompleted } = useOnboarding();
  const isResultsRoute = location.pathname.startsWith("/results/");
  const shouldGateUnauthContent = !user && !isResultsRoute;

  if (loading) return <AuthLoadingSkeleton />;
  // When unauthenticated, still render the shell underneath so AuthModalProvider can overlay.

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      {/* Welcome Flow gate — only after login */}
      {user && !welcomeCompleted && !isResultsRoute && <WelcomeFlow />}

      <Sidebar onOpenInvite={() => setInviteOpen(true)} />
      <MobileNavDrawer
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        onOpenInvite={() => setInviteOpen(true)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header
          onOpenNav={() => setMobileNavOpen(true)}
          onOpenCredits={() => setCreditsOpen(true)}
          onOpenNotifications={() => setNotificationsOpen(true)}
        />
        <main
          className={`relative min-w-0 flex-1 overflow-x-hidden transition-opacity duration-[280ms] ${
            shouldGateUnauthContent ? "pointer-events-none select-none" : ""
          }`}
          style={{ opacity: isNavigating ? 0.45 : 1 }}
        >
          <div
            aria-hidden={shouldGateUnauthContent}
            style={
              shouldGateUnauthContent
                ? {
                    filter: "blur(7px) saturate(0.6)",
                    opacity: 0.55,
                    transform: "scale(1.01)",
                  }
                : undefined
            }
            className="transition-[filter,opacity] duration-300"
          >
            <Outlet />
          </div>

          {/* Unauth content gradient mask + locked badge */}
          {shouldGateUnauthContent && (
            <>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-gray-50 via-gray-50/80 to-transparent"
              />
              <div className="pointer-events-none absolute right-6 top-6 z-10 flex items-center gap-2 rounded-full border border-violet-200 bg-white/90 px-3.5 py-1.5 text-xs font-medium text-violet-700 shadow-sm backdrop-blur-sm">
                <span className="flex h-1.5 w-1.5 rounded-full bg-violet-500" />
                登录后解锁完整爆款数据
              </div>
            </>
          )}
        </main>
      </div>

      {/* Checklist floating card */}
      <ChecklistCard />

      <InviteFriendsModal open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <CreditsQuickModal open={creditsOpen} onClose={() => setCreditsOpen(false)} />
      <NotificationsModal open={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </div>
  );
}

export function Root() {
  return (
    <OnboardingProvider>
      <AuthModalProvider>
        <AppShell />
        <WelcomeTrialModal />
        <LoginModal />
      </AuthModalProvider>
    </OnboardingProvider>
  );
}
