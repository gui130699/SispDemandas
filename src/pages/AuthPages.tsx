import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { sendPasswordResetEmail, signInWithEmailAndPassword } from 'firebase/auth'
import { Brand } from '../components/Brand'
import { auth } from '../lib/firebase'
import { useAuth } from '../features/auth/AuthContext'

export function LoginPage() {
  const { user, loading } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  if (!loading && user) return <Navigate to="/" />

  async function login(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch {
      setError('E-mail ou senha inválidos.')
    } finally {
      setSaving(false)
    }
  }

  return <section className="auth"><div className="auth-card">
    <Brand />
    <h1>Acessar sistema</h1>
    <form onSubmit={login}>
      <label>E-mail<input autoFocus type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <label>Senha<input type="password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
      {error && <p className="error">{error}</p>}
      <button className="primary" disabled={saving}>{saving ? 'Entrando…' : 'Entrar'}</button>
    </form>
    <Link to="/recuperar-senha">Recuperar senha</Link>
  </div></section>
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      await sendPasswordResetEmail(auth, email)
      setNotice('E-mail enviado.')
    } catch {
      setNotice('Não foi possível enviar o e-mail.')
    }
  }
  return <section className="auth"><div className="auth-card">
    <Brand />
    <h1>Recuperar senha</h1>
    <form onSubmit={submit}>
      <label>E-mail<input type="email" required value={email} onChange={event => setEmail(event.target.value)} /></label>
      <button className="primary">Enviar link</button>
    </form>
    <p>{notice}</p>
    <Link to="/login">Voltar ao acesso</Link>
  </div></section>
}

export function BlockedPage() {
  return <section className="auth"><div className="auth-card">
    <Brand />
    <h1>Acesso bloqueado</h1>
    <p>Seu usuário está inativo. Fale com o administrador.</p>
  </div></section>
}
