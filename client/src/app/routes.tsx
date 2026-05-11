import { Navigate, createBrowserRouter } from "react-router-dom";
import { Root } from "./components/Root";
import { AccountCenterPage } from "./pages/AccountCenterPage";
import { BreakdownPage } from "./pages/BreakdownPage";
import { ConnectorsPage } from "./pages/ConnectorsPage";
import { CreditsPage } from "./pages/CreditsPage";
import { HistoryPage } from "./pages/HistoryPage";
import { HomePage } from "./pages/HomePage";
import { HotTopicRecommendationsPage } from "./pages/HotTopicRecommendationsPage";
import { LandingPage } from "./pages/LandingPage";
import { LowFollowerPage } from "./pages/LowFollowerPage";
import { MonitorPage } from "./pages/MonitorPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { ResultsPage } from "./pages/ResultsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TermsPage } from "./pages/TermsPage";
import { ToolboxPage } from "./pages/ToolboxPage";
import { PerformancePage } from "./pages/PerformancePage";
import { PrivacyPage } from "./pages/PrivacyPage";
import { PredictionAgentResultsPage } from "./pages/PredictionAgentResultsPage";

export const router = createBrowserRouter([
  /* ─── Public pages (no sidebar / header) ─── */
  { path: "/landing", Component: LandingPage },
  { path: "/prediction-agent-results", Component: PredictionAgentResultsPage },
  { path: "/prediction-agent-results/:id", Component: PredictionAgentResultsPage },
  // /login no longer renders its own page — it redirects to default landing
  // where AuthModalProvider overlays the WelcomeTrial / Login modal flow.
  { path: "/login", element: <Navigate to="/hot-topic-recommendations" replace /> },
  { path: "/terms", Component: TermsPage },
  { path: "/privacy", Component: PrivacyPage },

  /* ─── App shell (sidebar + header) ─── */
  {
    path: "/",
    Component: Root,
    children: [
      // 默认登录后落地页：爆款选题推荐
      { index: true, element: <Navigate to="/hot-topic-recommendations" replace /> },
      { path: "hot-topic-recommendations", Component: HotTopicRecommendationsPage },
      // 「爆款预测agent」迁到 /predict（之前在 / 下）
      { path: "predict", Component: HomePage },
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
