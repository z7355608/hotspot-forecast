import { createBrowserRouter } from "react-router-dom";
import { Root } from "./components/Root";
import { AccountCenterPage } from "./pages/AccountCenterPage";
import { BreakdownPage } from "./pages/BreakdownPage";
import { ConnectorsPage } from "./pages/ConnectorsPage";
import { CreditsPage } from "./pages/CreditsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { LowFollowerPage } from "./pages/LowFollowerPage";
import { MonitorPage } from "./pages/MonitorPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResultsPage } from "./pages/ResultsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TermsPage } from "./pages/TermsPage";
import { ToolboxPage } from "./pages/ToolboxPage";
import { PerformancePage } from "./pages/PerformancePage";
import { PrivacyPage } from "./pages/PrivacyPage";

export const router = createBrowserRouter([
  /* ─── Public pages (no sidebar / header) ─── */
  { path: "/landing", Component: LandingPage },
  { path: "/login", Component: LoginPage },
  { path: "/terms", Component: TermsPage },
  { path: "/privacy", Component: PrivacyPage },

  /* ─── App shell (sidebar + header) ─── */
  {
    path: "/",
    Component: Root,
    children: [
      { index: true, Component: HomePage },
      { path: "results/:id", Component: ResultsPage },
      { path: "history", Component: HistoryPage },
      { path: "credits", Component: CreditsPage },
      { path: "connectors", Component: ConnectorsPage },
      { path: "settings", Component: SettingsPage },
      { path: "low-follower-opportunities", Component: LowFollowerPage },
      { path: "breakdown/:id", Component: BreakdownPage },
      { path: "monitor", Component: MonitorPage },
      { path: "account-center", Component: AccountCenterPage },
      { path: "toolbox", Component: ToolboxPage },
      { path: "performance", Component: PerformancePage },
      { path: "*", Component: NotFoundPage },
    ],
  },
]);