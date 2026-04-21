import { useState } from "react";
import { Outlet, useNavigation } from "react-router-dom";
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
  const isNavigating = navigation.state === "loading";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const { user, loading } = useAuth({ redirectOnUnauthenticated: true });
  const { welcomeCompleted } = useOnboarding();

  if (loading) return <AuthLoadingSkeleton />;
  if (!user) return <AuthLoadingSkeleton />;

  return (
    <div className="min-h-screen bg-gray-50 lg:flex">
      {/* Welcome Flow gate — overlay, stays on "/" */}
      {!welcomeCompleted && <WelcomeFlow />}

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
          className="min-w-0 flex-1 overflow-x-hidden transition-opacity duration-[280ms]"
          style={{ opacity: isNavigating ? 0.45 : 1 }}
        >
          <Outlet />
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
      <AppShell />
    </OnboardingProvider>
  );
}