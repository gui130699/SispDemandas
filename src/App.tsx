import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './features/auth/AuthContext'
import { AppLayout } from './layouts/AppLayout'
import { LoginPage, ForgotPasswordPage, BlockedPage } from './pages/AuthPages'
import { DashboardPage } from './pages/DashboardPage'
import { DemandsPage, DemandFormPage, DemandDetailPage } from './pages/DemandsPages'
import { CompaniesPage, UsersPage, LevelsPage, AuditPage } from './pages/AdminPages'
function Protected() { const { loading, profile } = useAuth(); if (loading) return <div className="center">Carregando sessão…</div>; if (!profile) return <Navigate to="/login" replace/>; if (!profile.active) return <BlockedPage/>; return <AppLayout/> }
export default function App() { return <AuthProvider><HashRouter><Routes><Route path="/login" element={<LoginPage/>}/><Route path="/recuperar-senha" element={<ForgotPasswordPage/>}/><Route path="/" element={<Protected/>}><Route index element={<DashboardPage/>}/><Route path="demandas" element={<DemandsPage/>}/><Route path="demandas/nova" element={<DemandFormPage/>}/><Route path="demandas/:id" element={<DemandDetailPage/>}/><Route path="empresas" element={<CompaniesPage/>}/><Route path="usuarios" element={<UsersPage/>}/><Route path="niveis" element={<LevelsPage/>}/><Route path="auditoria" element={<AuditPage/>}/></Route><Route path="*" element={<Navigate to="/" replace/>}/></Routes></HashRouter></AuthProvider> }
