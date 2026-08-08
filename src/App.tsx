import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";
import { AutoRefresh } from "./components/AutoRefresh";
import { AppLayout } from "./layouts/AppLayout";
import { LoginPage, ForgotPasswordPage, BlockedPage } from "./pages/AuthPages";
import { PublicRegistrationPage } from "./pages/PublicRegistrationPage";
import { ApprovalsPage } from "./pages/ApprovalsPage";
import { StatusesPage } from "./pages/StatusesPage";
import { DashboardPage } from "./pages/DashboardPage";
import {
  DemandsPage,
  DemandFormPage,
  DemandDetailPage,
} from "./pages/DemandsPages";
import {
  UsersPage,
  LevelsPage,
  AuditPage,
} from "./pages/AdminPages";
import { CompaniesManagementPage } from "./pages/CompaniesManagementPage";
function Protected() {
  const { loading, profile } = useAuth();
  if (loading) return <div className="center">Carregando sessão…</div>;
  if (!profile) return <Navigate to="/login" replace />;
  if (!profile.active) return <BlockedPage />;
  return <AppLayout />;
}
export default function App() {
  return (
    <AuthProvider>
      <AutoRefresh />
      <HashRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/cadastro" element={<PublicRegistrationPage />} />
          <Route path="/recuperar-senha" element={<ForgotPasswordPage />} />
          <Route path="/" element={<Protected />}>
            <Route index element={<DashboardPage />} />
            <Route path="demandas" element={<DemandsPage />} />
            <Route path="demandas/nova" element={<DemandFormPage />} />
            <Route path="demandas/:id" element={<DemandDetailPage />} />
            <Route path="empresas" element={<CompaniesManagementPage />} />
            <Route path="usuarios" element={<UsersPage />} />
            <Route path="aprovacoes" element={<ApprovalsPage />} />
            <Route path="status" element={<StatusesPage />} />
            <Route path="niveis" element={<LevelsPage />} />
            <Route path="auditoria" element={<AuditPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
