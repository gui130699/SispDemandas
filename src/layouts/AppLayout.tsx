import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Brand } from '../components/Brand'
import { useAuth } from '../features/auth/AuthContext'
import { isAdmin } from '../utils/permissions'

const navigation = [['/', '▦', 'Dashboard'], ['/demandas', '☷', 'Demandas']] as const

export function AppLayout() {
  const { profile, logout } = useAuth()
  const [dark, setDark] = useState(() => localStorage.theme
    ? localStorage.theme === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches)
  const [open, setOpen] = useState(false)
  const [update, setUpdate] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    localStorage.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    const handler = () => setUpdate(true)
    window.addEventListener('sisp-update-ready', handler)
    return () => window.removeEventListener('sisp-update-ready', handler)
  }, [])

  const adminItems = isAdmin(profile)
    ? [['/empresas', '▣', 'Empresas'], ['/usuarios', '♙', 'Usuários'], ['/niveis', '⚙', 'Níveis e SLA'], ['/auditoria', '◈', 'Auditoria']] as const
    : []

  return <div className="shell">
    <aside className={open ? 'sidebar open' : 'sidebar'}>
      <Brand compact />
      <nav>{[...navigation, ...adminItems].map(([to, icon, label]) =>
        <NavLink onClick={() => setOpen(false)} key={to} to={to} end={to === '/'}><span>{icon}</span>{label}</NavLink>)}</nav>
    </aside>
    <main>
      <header>
        <button className="icon mobile" onClick={() => setOpen(!open)}>☰</button>
        <div><strong>{profile?.name}</strong><small>{profile?.role === 'admin' ? 'Administrador' : profile?.role === 'consultant' ? 'Consultor' : 'Solicitante'} {profile?.companyName && `• ${profile.companyName}`}</small></div>
        <div className="push" />
        <span className="online">● Online</span>
        <button className="icon" aria-label="Alternar tema" onClick={() => setDark(!dark)}>{dark ? '☀' : '☾'}</button>
        <button className="icon" aria-label="Sair" onClick={() => logout().then(() => navigate('/login'))}>⇥</button>
      </header>
      {update && <div className="update">Nova versão disponível <button onClick={() => window.dispatchEvent(new Event('sisp-apply-update'))}>Atualizar</button></div>}
      <Outlet />
    </main>
  </div>
}
