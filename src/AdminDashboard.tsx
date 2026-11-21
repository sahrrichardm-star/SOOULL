import { useCallback, useEffect, useState } from 'react'
import {
  Activity, Archive, ArrowLeft, BrainCircuit, Database, RefreshCw, LogOut,
  ShieldAlert, ShieldCheck, Users, Wallet, BookOpen, HardDrive,
} from 'lucide-react'
import { supabase } from './lib/supabase'

type AdminUser = { id: string; email: string; name: string; created_at: string; last_sign_in_at: string | null; email_confirmed_at: string | null; banned_until: string | null }

type AdminMetrics = {
  registered_users: number
  new_users_7d: number
  active_users_30d: number
  stories: number
  legacy_entries: number
  safekeeping_records: number
  assets: number
  storage_bytes: number
  wallet_records: number
  enabled_personas: number
  trusted_people_records: number
  legacy_access_requests_pending: number
}

const number = (value: unknown) => new Intl.NumberFormat().format(Number(value ?? 0))
const bytes = (value: unknown) => {
  const size = Number(value ?? 0)
  if (!size) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1)
  return (size / Math.pow(1024, index)).toFixed(index > 1 ? 1 : 0) + ' ' + units[index]
}

export default function AdminDashboard({ onSignOut }: { onSignOut: () => void }) {
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null)
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [refreshedAt, setRefreshedAt] = useState('')
  const [activeTab, setActiveTab] = useState<'overview' | 'customers'>('overview')
  const [users, setUsers] = useState<AdminUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userPage, setUserPage] = useState(1)
  const [usersHaveMore, setUsersHaveMore] = useState(false)
  const [userSearch, setUserSearch] = useState('')

  const load = useCallback(async () => {
    if (!supabase) {
      setError('The SOOULL data service is unavailable.')
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-overview', { method: 'POST', body: {} })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(String(data.error))
      if (!data?.metrics || typeof data.metrics !== 'object') throw new Error('The administrator service returned an invalid response.')
      setRole(String(data.role ?? ''))
      setMetrics(data.metrics as AdminMetrics)
      setRefreshedAt(String(data.generatedAt ?? new Date().toISOString()))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load administrator metrics.')
      setMetrics(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadUsers = useCallback(async (page: number) => {
    if (!supabase) return
    setUsersLoading(true)
    setError('')
    try {
      const { data, error: invokeError } = await supabase.functions.invoke('admin-overview', {
        method: 'POST',
        body: { action: 'users', page, perPage: 25 },
      })
      if (invokeError) throw invokeError
      if (data?.error) throw new Error(String(data.error))
      setUsers((data?.users ?? []) as AdminUser[])
      setUserPage(Number(data?.page ?? page))
      setUsersHaveMore(Boolean(data?.hasMore))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load customer accounts.')
    } finally {
      setUsersLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const cards = [
    { label: 'Registered customers', value: metrics ? number(metrics?.registered_users) : 'Unavailable', detail: '+' + number(metrics?.new_users_7d) + ' in the last 7 days', icon: Users },
    { label: 'Active customers', value: metrics ? number(metrics?.active_users_30d) : 'Unavailable', detail: 'Signed in within 30 days', icon: Activity },
    { label: 'Saved stories', value: metrics ? number(metrics?.stories) : 'Unavailable', detail: 'Private customer records', icon: BookOpen },
    { label: 'Legacy entries', value: metrics ? number(metrics?.legacy_entries) : 'Unavailable', detail: 'Private legacy records', icon: Archive },
    { label: 'Private assets', value: metrics ? number(metrics?.assets) : 'Unavailable', detail: 'Files stored in SOOULL', icon: HardDrive },
    { label: 'Storage used', value: metrics ? bytes(metrics?.storage_bytes) : 'Unavailable', detail: 'Based on registered asset sizes', icon: Database },
    { label: 'Wallet records', value: metrics ? number(metrics?.wallet_records) : 'Unavailable', detail: 'Private customer references', icon: Wallet },
    { label: 'Active AI personas', value: metrics ? number(metrics?.enabled_personas) : 'Unavailable', detail: 'Enabled persona profiles', icon: BrainCircuit },
    { label: 'Trusted people', value: metrics ? number(metrics?.trusted_people_records) : 'Unavailable', detail: 'Owner-managed trusted contacts', icon: Users },
    { label: 'Pending legacy requests', value: metrics ? number(metrics?.legacy_access_requests_pending) : 'Unavailable', detail: 'Awaiting independent verification', icon: ShieldAlert },
  ]

  return (
    <main className="admin-shell">
      <header className="admin-topbar">
        <a className="brand" href="https://sooull.vercel.app"><span className="admin-brand-mark">S</span><span>SOOULL</span></a>
        <div className="admin-topbar-actions">
          <span className="admin-role"><ShieldCheck size={14} /> {role.replaceAll('_', ' ') || 'Administrator'}</span>
          <a className="admin-back-link" href="https://sooull.vercel.app"><ArrowLeft size={15} /> Customer app</a>
          <button className="admin-back-link" type="button" onClick={onSignOut}><LogOut size={15} /> Sign out</button>
        </div>
      </header>

      <section className="admin-heading">
        <div>
          <span className="eyebrow"><ShieldCheck size={14} /> RESTRICTED CONTROL CENTRE</span>
          <h1>Administration</h1>
          <p>Platform operations and aggregate customer insights. Private customer content is not displayed here.</p>
        </div>
        <button className="dashboard-primary" type="button" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? 'admin-spinning' : ''} /> {loading ? 'Refreshing…' : 'Refresh data'}
        </button>
      </section>

      {error && <section className="admin-alert" role="alert"><ShieldAlert size={18} /><div><strong>Administrator data unavailable</strong><p>{error}</p></div></section>}

      <nav className="admin-nav-tabs" aria-label="Administration sections">
        <button type="button" className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>Overview</button>
        {role !== "analytics_admin" && <button type="button" className={activeTab === "customers" ? "active" : ""} onClick={() => { setActiveTab("customers"); if (users.length === 0) void loadUsers(1) }}>Customers</button>}
      </nav>

      <section className="admin-metric-grid" aria-label="Platform metrics">
        {cards.map(({ label, value, detail, icon: Icon }) => (
          <article className="admin-metric-card" key={label}>
            <span className="admin-metric-icon"><Icon size={19} /></span>
            <span className="admin-metric-label">{label}</span>
            <strong>{loading ? '—' : value}</strong>
            <small>{detail}</small>
          </article>
        ))}
      </section>

      <section className="admin-section-grid">
        <article className="admin-panel">
          <div className="admin-panel-heading"><ShieldAlert size={18} /><h2>Security centre</h2></div>
          <p>Authentication, administrator access and platform security checks will be consolidated here.</p>
          <span className="admin-status-note"><span className="admin-status-dot" /> Administrator API protected by MFA</span>
        </article>
        <article className="admin-panel">
          <div className="admin-panel-heading"><Activity size={18} /><h2>Operations</h2></div>
          <p>Service health, storage failures, AI service availability and backup operations will be monitored here.</p>
          <span className="admin-status-note">Metrics refreshed {refreshedAt ? new Date(refreshedAt).toLocaleString() : 'not yet'}</span>
        </article>
      </section>

      {activeTab === "customers" && role !== "analytics_admin" && <section className="admin-customers-panel">
        <div className="admin-panel-heading"><Users size={18} /><h2>Customer accounts</h2></div>
        <p>Account metadata only. Private stories, documents, voice recordings and AI conversations are not shown here.</p>
        <input className="admin-search-input" type="search" value={userSearch} onChange={event => setUserSearch(event.target.value)} placeholder="Filter this page by name or email" aria-label="Filter customers" />
        {usersLoading ? <p className="admin-status-note">Loading customer accounts…</p> : <div className="admin-table-wrap">
          <table className="admin-users-table">
            <thead><tr><th>Customer</th><th>Registered</th><th>Last sign-in</th><th>Email</th><th>Account status</th></tr></thead>
            <tbody>{users.filter(item => (item.name + " " + item.email).toLowerCase().includes(userSearch.toLowerCase())).map(item => {
              const suspended = item.banned_until && new Date(item.banned_until).getTime() > Date.now()
              return <tr key={item.id}>
                <td><strong>{item.name || "Name not completed"}</strong><small>{item.email}</small></td>
                <td>{new Date(item.created_at).toLocaleDateString()}</td>
                <td>{item.last_sign_in_at ? new Date(item.last_sign_in_at).toLocaleDateString() : "Never"}</td>
                <td><span className={item.email_confirmed_at ? "admin-status-good" : "admin-status-pending"}>{item.email_confirmed_at ? "Verified" : "Unverified"}</span></td>
                <td><span className={suspended ? "admin-status-pending" : "admin-status-good"}>{suspended ? "Suspended" : "Active"}</span></td>
              </tr>
            })}</tbody>
          </table>
          {!users.length && <p className="admin-status-note">No customer accounts were returned for this page.</p>}
        </div>}
        <div className="admin-pagination">
          <button type="button" className="account-secondary-button" disabled={usersLoading || userPage <= 1} onClick={() => void loadUsers(userPage - 1)}>Previous</button>
          <span>Page {userPage}</span>
          <button type="button" className="account-secondary-button" disabled={usersLoading || !usersHaveMore} onClick={() => void loadUsers(userPage + 1)}>Next</button>
        </div>
      </section>}
      <footer className="admin-footer">
        <span>SOOULL · ADMINISTRATION</span>
        <span>Privileged actions must be audited. Customer memories remain private.</span>
      </footer>
    </main>
  )
}
