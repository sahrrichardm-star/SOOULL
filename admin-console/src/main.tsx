import { useEffect, useState, type FormEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRight, Heart, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import AdminDashboard from './AdminDashboard'
import { supabase } from './lib/supabase'
import './styles.css'
import './admin-entry.css'

type Stage = 'checking' | 'signin' | 'mfa' | 'enroll' | 'not-admin' | 'dashboard' | 'forgot' | 'sent' | 'config-error'
type Factor = { id: string; friendly_name?: string }

function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [stage, setStage] = useState<Stage>('checking')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [factorId, setFactorId] = useState('')
  const [factors, setFactors] = useState<Factor[]>([])
  const [code, setCode] = useState('')
  const [qrCode, setQrCode] = useState('')
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    if (!supabase) { setStage('config-error'); return }
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (active) {
        setSession(data.session)
        setStage(data.session ? 'checking' : 'signin')
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      setSession(nextSession)
      if (event === 'PASSWORD_RECOVERY') setStage('signin')
      else setStage(nextSession ? 'checking' : 'signin')
    })
    return () => { active = false; subscription.unsubscribe() }
  }, [])

  useEffect(() => {
    if (!supabase || !session || stage !== 'checking') return
    let active = true
    async function verifySession() {
      try {
        const [{ data: assurance, error: assuranceError }, { data: factorData, error: factorError }] = await Promise.all([
          supabase!.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase!.auth.mfa.listFactors(),
        ])
        if (assuranceError) throw assuranceError
        if (factorError) throw factorError
        const allTotp = factorData.totp as Array<{ id: string; friendly_name?: string; status: string }>
        const verified = allTotp.filter(item => item.status === 'verified')
        if (!active) return
        const { data: activeRole, error: roleCheckError } = await supabase!.rpc('current_admin_role')
        if (roleCheckError) throw roleCheckError
        if (!activeRole) { setStage('not-admin'); return }
        // Discard abandoned, unverified enrollments. An interrupted QR setup must be restarted.
        const pending = allTotp.filter(item => item.status === 'unverified')
        for (const factor of pending) {
          const { error: cleanupError } = await supabase!.auth.mfa.unenroll({ factorId: factor.id })
          if (cleanupError) throw cleanupError
        }
        setFactors(verified.map(item => ({ id: item.id, friendly_name: item.friendly_name })))
        if (assurance.currentLevel !== 'aal2') {
          if (verified.length) {
            setFactorId(verified[0].id)
            setStage('mfa')
          } else {
            setStage('enroll')
          }
          return
        }
        const { data: role, error: roleError } = await supabase!.rpc('current_admin_role')
        if (roleError) throw roleError
        if (active) setStage(role ? 'dashboard' : 'not-admin')
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : 'Your administrator session could not be verified.')
          setStage('signin')
        }
      }
    }
    void verifySession()
    return () => { active = false }
  }, [session?.access_token, stage])

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
      if (authError) throw authError
      setSession(data.session)
      setStage('checking')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to sign in.')
    } finally { setBusy(false) }
  }

  async function sendReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: 'https://sooull.vercel.app',
      })
      if (resetError) throw resetError
      setStage('sent')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Password reset could not be requested.')
    } finally { setBusy(false) }
  }

  async function verifyFactor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !factorId || busy) return
    setBusy(true); setError('')
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() })
      if (verifyError) throw verifyError
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assuranceError) throw assuranceError
      if (assurance.currentLevel === 'aal2') {
        const { data: role, error: roleError } = await supabase.rpc('current_admin_role')
        if (roleError) throw roleError
        setStage(role ? 'dashboard' : 'not-admin')
      } else {
        await supabase.auth.refreshSession()
        setStage('checking')
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The authenticator code was not accepted.')
    } finally { setBusy(false) }
  }

  async function beginEnrollment() {
    if (!supabase || busy) return
    setBusy(true); setError('')
    try {
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'SOOULL administrator authenticator' })
      if (enrollError) throw enrollError
      setFactorId(data.id)
      setQrCode(data.totp.qr_code)
      setSecret(data.totp.secret)
      setCode('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authenticator setup could not be started.')
    } finally { setBusy(false) }
  }

  async function verifyEnrollment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!supabase || !factorId || busy) return
    setBusy(true); setError('')
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId })
      if (challengeError) throw challengeError
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code: code.trim() })
      if (verifyError) throw verifyError
      const { data: assurance, error: assuranceError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (assuranceError) throw assuranceError
      if (assurance.currentLevel !== 'aal2') {
        await supabase.auth.refreshSession()
        setStage('checking')
        return
      }
      const { data: role, error: roleError } = await supabase.rpc('current_admin_role')
      if (roleError) throw roleError
      setStage(role ? 'dashboard' : 'not-admin')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Authenticator verification failed.')
    } finally { setBusy(false) }
  }

  async function signOut() {
    if (supabase) await supabase.auth.signOut()
    setSession(null); setPassword(''); setStage('signin'); setError('')
  }

  if (stage === 'dashboard' && session) return <AdminDashboard onSignOut={() => void signOut()} />

  return (
    <main className="admin-auth-screen">
      <section className="admin-auth-panel">
        <div className="admin-auth-brand">
          <span className="admin-auth-symbol"><Heart size={20} fill="currentColor" /></span>
          <span><strong>SOOULL</strong><small>ADMINISTRATION</small></span>
        </div>
        <div className="admin-auth-heading">
          <span className="admin-auth-kicker"><ShieldCheck size={14} /> RESTRICTED ACCESS</span>
          <h1>{stage === 'mfa' ? 'Verify your identity' : stage === 'enroll' ? 'Secure this account' : stage === 'forgot' || stage === 'sent' ? 'Reset password' : stage === 'not-admin' ? 'No administrator access' : 'Administrator sign in'}</h1>
          <p>{stage === 'mfa' ? 'Enter the six-digit code from your authenticator app.' : stage === 'enroll' ? 'Administrator access requires an authenticator. Set it up before continuing.' : stage === 'not-admin' ? 'This account does not have an active SOOULL administrator role.' : stage === 'sent' ? 'If the address belongs to an account, a password-reset link has been sent.' : 'Sign in with your authorised SOOULL administrator account.'}</p>
        </div>
        {stage === 'checking' && <div className="admin-auth-loading"><span className="loading-ring" />Checking administrator permissions and MFA…</div>}
        {stage === 'config-error' && <p className="admin-auth-error">The administrator application is missing its Supabase public configuration.</p>}
        {stage === 'signin' && <form className="admin-auth-form" onSubmit={signIn}>
          <label htmlFor="admin-email">Email address</label>
          <input id="admin-email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
          <label htmlFor="admin-password">Password</label>
          <input id="admin-password" type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} />
          <button className="dashboard-primary" type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in securely'} <ArrowRight size={16} /></button>
          <button className="admin-auth-link" type="button" onClick={() => { setStage('forgot'); setError('') }}>Forgot password?</button>
        </form>}
        {stage === 'forgot' && <form className="admin-auth-form" onSubmit={sendReset}>
          <label htmlFor="reset-email">Administrator email address</label>
          <input id="reset-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} placeholder="you@example.com" />
          <button className="dashboard-primary" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'} <ArrowRight size={16} /></button>
          <button className="admin-auth-link" type="button" onClick={() => setStage('signin')}>Back to sign in</button>
        </form>}
        {stage === 'sent' && <button className="admin-auth-link" type="button" onClick={() => setStage('signin')}>Back to sign in</button>}
        {stage === 'mfa' && <form className="admin-auth-form" onSubmit={verifyFactor}>
          {factors.length > 1 && <><label htmlFor="admin-factor">Authenticator</label><select id="admin-factor" value={factorId} onChange={event => setFactorId(event.target.value)}>{factors.map((factor,index) => <option key={factor.id} value={factor.id}>{factor.friendly_name || 'Authenticator ' + (index + 1)}</option>)}</select></>}
          <p className="admin-auth-step">Open the authenticator app you enrolled for SOOULL. Enter the current six-digit code shown beside your SOOULL account. It changes approximately every 30 seconds.</p>
          <label htmlFor="admin-code">Six-digit authenticator code</label>
          <input id="admin-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g,'').slice(0,6))} />
          <button className="dashboard-primary" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Verify and continue'} <ShieldCheck size={16} /></button>
        </form>}
        {stage === 'enroll' && <div className="admin-auth-form">
          {!qrCode ? <button className="dashboard-primary" type="button" onClick={() => void beginEnrollment()} disabled={busy}>{busy ? 'Preparing…' : 'Set up authenticator'} <KeyRound size={16} /></button> : <form onSubmit={verifyEnrollment}>
            <p className="admin-auth-step">1. Open an authenticator app such as Google Authenticator, Microsoft Authenticator, or 1Password. Add an account and scan this QR code. The app—not SMS or Google Password Manager—generates a rotating six-digit code every 30 seconds.</p>
            <img className="admin-auth-qr" src={qrCode.startsWith('data:') ? qrCode : 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(qrCode)} alt="Authenticator setup QR code" />
            <label htmlFor="admin-secret">Manual setup key (keep private)</label>
            <input id="admin-secret" readOnly value={secret} onFocus={event => event.currentTarget.select()} />
            <p className="admin-auth-step">2. Find the SOOULL entry in your authenticator app and enter its current six-digit code below.</p>
            <label htmlFor="enrol-code">Authenticator code</label>
            <input id="enrol-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g,'').slice(0,6))} />
            <button className="dashboard-primary" type="submit" disabled={busy || code.length !== 6}>{busy ? 'Verifying…' : 'Enable two-step verification'} <ShieldCheck size={16} /></button>
          </form>}
        </div>}
        {stage === 'not-admin' && <button className="dashboard-primary" type="button" onClick={() => void signOut()}>Sign out</button>}
        {error && <p className="admin-auth-error" role="alert">{error}</p>}
        {notice && <p className="admin-auth-notice" role="status">{notice}</p>}
        {(stage === 'mfa' || stage === 'enroll' || stage === 'not-admin') && <button className="admin-auth-link" type="button" onClick={() => void signOut()}>Sign out</button>}
        <footer className="admin-auth-footer"><LockKeyhole size={13} /> Protected by SOOULL identity, MFA and role-based access controls</footer>
      </section>
    </main>
  )
}

import { createRoot } from 'react-dom/client'
createRoot(document.getElementById('root')!).render(<App />)
