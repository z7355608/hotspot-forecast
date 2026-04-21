import { useEffect, useState } from "react";
import { getToken, getMe, clearToken, type AdminUser } from "./api";
import { AdminShell, type AdminPage } from "./components/AdminShell";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { UsersPage } from "./pages/UsersPage";
import { ConfigPage } from "./pages/ConfigPage";
import { SkillsPage } from "./pages/SkillsPage";
import { LogsPage } from "./pages/LogsPage";
import { PerformanceMonitorPage } from "./pages/PerformanceMonitorPage";
import { ApiUsagePage } from "./pages/ApiUsagePage";

type AuthState = "loading" | "unauthenticated" | "authenticated";

export function AdminApp() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [user, setUser] = useState<AdminUser | null>(null);
  const [currentPage, setCurrentPage] = useState<AdminPage>("dashboard");

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setAuthState("unauthenticated");
      return;
    }
    getMe()
      .then((u) => {
        if (!u.isAdmin) {
          clearToken();
          setAuthState("unauthenticated");
          return;
        }
        setUser(u);
        setAuthState("authenticated");
      })
      .catch(() => {
        clearToken();
        setAuthState("unauthenticated");
      });
  }, []);

  if (authState === "loading") {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500 text-sm">验证身份中...</div>
      </div>
    );
  }

  if (authState === "unauthenticated") {
    return (
      <LoginPage
        onLogin={() => {
          getMe().then((u) => {
            setUser(u);
            setAuthState("authenticated");
          });
        }}
      />
    );
  }

  if (!user) return null;

  const pageMap: Record<AdminPage, React.ReactNode> = {
    dashboard: <DashboardPage />,
    users: <UsersPage />,
    config: <ConfigPage />,
    skills: <SkillsPage />,
    logs: <LogsPage />,
    performance: <PerformanceMonitorPage />,
    "api-usage": <ApiUsagePage />,
  };

  return (
    <AdminShell
      user={user}
      currentPage={currentPage}
      onNavigate={setCurrentPage}
      onLogout={() => {
        setUser(null);
        setAuthState("unauthenticated");
      }}
    >
      {pageMap[currentPage]}
    </AdminShell>
  );
}
