import { useEffect, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  CircleHelp,
  Coffee,
  Download,
  FileText,
  House,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  TrendingUp,
  Utensils,
  Wallet,
  X,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type User = { id: number; name: string; email: string }
type Session = { token: string; user: User }
type Expense = { id: string; description: string; amount: number; category: string; date: string }
type Report = {
  monthly: { month: string; key: string; total: number }[]
  categories: { category: string; total: number }[]
  total: number
  count: number
  average: number
  this_month: number
  last_month: number
}

const categories = ['Food & dining', 'Transport', 'Shopping', 'Bills', 'Health', 'Entertainment', 'Travel', 'Other']
const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const currentMonth = () => new Date().toLocaleDateString('en-CA')

async function request<T>(path: string, token?: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.error || 'Something went wrong. Please try again.')
  }
  if (response.status === 204) return undefined as T
  return response.json() as Promise<T>
}

function getStoredSession(): Session | null {
  try {
    const saved = localStorage.getItem('ledgerly-session')
    return saved ? JSON.parse(saved) as Session : null
  } catch {
    return null
  }
}

export default function App() {
  const [session, setSession] = useState<Session | null>(getStoredSession)

  function signOut() {
    localStorage.removeItem('ledgerly-session')
    setSession(null)
  }

  if (!session) {
    return <SignIn onSuccess={(nextSession) => {
      localStorage.setItem('ledgerly-session', JSON.stringify(nextSession))
      setSession(nextSession)
    }} />
  }

  return <Dashboard session={session} onSignOut={signOut} />
}

function SignIn({ onSuccess }: { onSuccess: (session: Session) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const result = await request<Session>(`/auth/${mode}`, undefined, {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      })
      onSuccess(result)
    } catch (submissionError) {
      setError(submissionError instanceof Error ? submissionError.message : 'Unable to sign in.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <a className="brand" href="#home" aria-label="Ledgerly home"><span className="brand-mark"><Wallet size={19} /></span>ledgerly<span className="brand-period">.</span></a>
        <div className="story-copy">
          <div className="eyebrow"><Sparkles size={14} /> YOUR MONEY, IN FOCUS</div>
          <h1>Make every<br />dollar <em>make sense.</em></h1>
          <p>A little more clarity goes a long way. Bring your spending together and see where the month is really going.</p>
          <div className="story-note"><span className="note-line" /><span>Simple by design. Yours by default.</span></div>
        </div>
        <div className="story-bottom"><span>PERSONAL FINANCE, WITHOUT THE FUSS</span><span>01 — 03</span></div>
      </section>
      <section className="auth-side">
        <div className="auth-topline"><span>Already have an account?</span><button className="text-button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Create one' : 'Sign in'} <ArrowRight size={14} /></button></div>
        <div className="auth-card">
          <div className="auth-icon"><ShieldCheck size={20} /></div>
          <p className="section-kicker">{mode === 'login' ? 'WELCOME BACK' : 'A FRESH START'}</p>
          <h2>{mode === 'login' ? 'Good to see you.' : 'Let’s get you set up.'}</h2>
          <p className="auth-intro">{mode === 'login' ? 'Your financial picture, right where you left it.' : 'Create your account and take control of your spending.'}</p>
          <form onSubmit={submit} className="auth-form">
            {mode === 'register' && <label>Your name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Alex Morgan" minLength={2} maxLength={80} required /></label>}
            <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" required /></label>
            <label>Password<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" minLength={8} required /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="primary-button auth-submit" type="submit" disabled={submitting}>{submitting ? 'Please wait…' : mode === 'login' ? 'Sign in to your account' : 'Create your account'} <ArrowRight size={16} /></button>
          </form>
          <p className="auth-privacy"><ShieldCheck size={14} /> Your password is securely hashed and never stored in plain text.</p>
        </div>
        <div className="auth-foot"><span>© 2026 Ledgerly</span><span>YOUR DATA STAYS YOURS</span></div>
      </section>
    </main>
  )
}

function Dashboard({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [view, setView] = useState<'overview' | 'transactions' | 'reports'>('overview')
  const [month, setMonth] = useState(currentMonth().slice(0, 7))
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [report, setReport] = useState<Report | null>(null)
  const [query, setQuery] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All categories')
  const [showForm, setShowForm] = useState(false)
  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [category, setCategory] = useState(categories[0])
  const [date, setDate] = useState(currentMonth())
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.all([
      request<Expense[]>(`/expenses?month=${month}`, session.token),
      request<Report>('/reports', session.token),
    ]).then(([nextExpenses, nextReport]) => {
      if (active) {
        setExpenses(nextExpenses)
        setReport(nextReport)
        setError('')
      }
    }).catch((loadError: unknown) => {
      if (active) {
        if (loadError instanceof Error && loadError.message.startsWith('Your session expired')) onSignOut()
        else setError(loadError instanceof Error ? loadError.message : 'Unable to load your expenses.')
      }
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [month, onSignOut, reloadKey, session.token])

  const visibleExpenses = expenses.filter((expense) => {
    const matchesQuery = `${expense.description} ${expense.category}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (categoryFilter === 'All categories' || expense.category === categoryFilter)
  })

  async function addExpense(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    try {
      await request<Expense>('/expenses', session.token, {
        method: 'POST',
        body: JSON.stringify({ description, amount: Number(amount), category, date }),
      })
      setDescription('')
      setAmount('')
      setShowForm(false)
      setMonth(date.slice(0, 7))
      setReloadKey((value) => value + 1)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save this expense.')
    }
  }

  async function removeExpense(id: string) {
    try {
      await request<void>(`/expenses/${id}`, session.token, { method: 'DELETE' })
      setReloadKey((value) => value + 1)
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove this expense.')
    }
  }

  function exportCsv() {
    const rows = [['Date', 'Description', 'Category', 'Amount'], ...visibleExpenses.map((expense) => [expense.date, expense.description, expense.category, expense.amount.toFixed(2)])]
    const csv = rows.map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n')
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    link.download = `ledgerly-expenses-${month}.csv`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const monthLabel = new Date(`${month}-02T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const monthSpend = report?.this_month ?? 0
  const lastMonth = report?.last_month ?? 0
  const monthChange = lastMonth ? ((monthSpend - lastMonth) / lastMonth) * 100 : 0
  const displayedTotal = month === currentMonth().slice(0, 7) ? monthSpend : expenses.reduce((sum, expense) => sum + expense.amount, 0)

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand sidebar-brand" href="#overview"><span className="brand-mark"><Wallet size={18} /></span>ledgerly<span className="brand-period">.</span></a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === 'overview' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('overview')}><House size={17} /> Overview</button>
          <button className={view === 'transactions' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('transactions')}><FileText size={17} /> Transactions</button>
          <button className={view === 'reports' ? 'nav-link selected' : 'nav-link'} onClick={() => setView('reports')}><ChartNoAxesCombined size={17} /> Reports</button>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-note"><span className="privacy-icon"><ShieldCheck size={16} /></span><div><strong>Your data is private</strong><small>Only you can see your finances.</small></div></div>
          <button className="profile-button" onClick={onSignOut} title="Sign out"><span className="avatar">{session.user.name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase()}</span><span className="profile-copy"><strong>{session.user.name}</strong><small>{session.user.email}</small></span><LogOut size={16} /></button>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumb">Workspace <span>/</span> <strong>{view === 'overview' ? 'Overview' : view === 'transactions' ? 'Transactions' : 'Reports'}</strong></div><div className="topbar-actions"><span className="secure-indicator"><span /> Secure workspace</span><button className="icon-button help-button" title="Account security"><CircleHelp size={17} /></button></div></header>
        <div className="page-content">
          <div className="page-heading"><div><p className="section-kicker">{view === 'overview' ? 'YOUR FINANCES AT A GLANCE' : view === 'transactions' ? 'YOUR SPENDING, ORGANIZED' : 'THE BIGGER PICTURE'}</p><h1>{view === 'overview' ? `Good ${greeting()}, ${session.user.name.split(' ')[0]}.` : view === 'transactions' ? 'Transactions' : 'Reports'}</h1><p className="page-subtitle">{view === 'overview' ? 'Here’s what your money has been up to.' : view === 'transactions' ? `Everything you spent in ${monthLabel.toLowerCase()}.` : 'Understand your spending, month by month.'}</p></div><div className="heading-actions"><label className="month-picker"><SlidersHorizontal size={15} /><input aria-label="Select month" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><ChevronDown size={13} /></label><button className="primary-button add-button" onClick={() => setShowForm(!showForm)}><Plus size={17} /> Add expense</button></div></div>

          {error && <div className="notice-error" role="alert">{error}<button className="icon-button" aria-label="Dismiss" onClick={() => setError('')}><X size={15} /></button></div>}

          {showForm && <form className="expense-form" onSubmit={addExpense}><div className="form-heading"><div><strong>New expense</strong><span>Add a purchase to your ledger.</span></div><button type="button" className="icon-button" aria-label="Close form" onClick={() => setShowForm(false)}><X size={17} /></button></div><label>Description<input autoFocus value={description} onChange={(event) => setDescription(event.target.value)} placeholder="e.g. Weekly groceries" maxLength={120} required /></label><label>Amount<input type="number" min="0.01" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" required /></label><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Date<input type="date" value={date} onChange={(event) => setDate(event.target.value)} required /></label><div className="form-actions"><button type="button" className="secondary-button" onClick={() => setShowForm(false)}>Cancel</button><button className="primary-button" type="submit"><Check size={15} /> Save expense</button></div></form>}

          {view === 'overview' && <>
            <section className="metric-grid" aria-label="Spending summary">
              <article className="metric-card spending-card"><div className="metric-top"><span className="metric-label">TOTAL SPENT THIS MONTH</span><span className="metric-icon mint"><Wallet size={17} /></span></div><strong className="metric-value">{currency.format(displayedTotal)}</strong><div className="metric-foot"><span className={monthChange > 0 ? 'change-pill negative' : 'change-pill positive'}>{monthChange > 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}{Math.abs(monthChange).toFixed(0)}%</span><span>vs. last month</span></div><div className="metric-sparkline"><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /><span /></div></article>
              <article className="metric-card"><div className="metric-top"><span className="metric-label">TRANSACTIONS</span><span className="metric-icon blue"><FileText size={17} /></span></div><strong className="metric-value">{month === currentMonth().slice(0, 7) ? report?.count ?? 0 : expenses.length}</strong><div className="metric-foot"><span className="foot-muted">Recorded in {monthLabel}</span></div><div className="metric-underline blue-line" /></article>
              <article className="metric-card"><div className="metric-top"><span className="metric-label">AVERAGE PURCHASE</span><span className="metric-icon coral"><Banknote size={17} /></span></div><strong className="metric-value">{currency.format(month === currentMonth().slice(0, 7) ? report?.average ?? 0 : expenses.length ? displayedTotal / expenses.length : 0)}</strong><div className="metric-foot"><span className="foot-muted">Across all your expenses</span></div><div className="metric-underline coral-line" /></article>
            </section>

            <section className="content-grid"><article className="panel spending-panel"><div className="panel-header"><div><p className="section-kicker">SPENDING OVER TIME</p><h2>A steadier view</h2></div><span className="panel-chip"><span className="legend-dot" /> Total spending</span></div><div className="chart-wrap">{report && <ResponsiveContainer width="100%" height="100%"><AreaChart data={report.monthly} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#57aa8d" stopOpacity={0.2} /><stop offset="100%" stopColor="#57aa8d" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eceee8" strokeDasharray="3 5" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8e968c', fontSize: 11 }} dy={9} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8e968c', fontSize: 10 }} tickFormatter={(value: number) => value >= 1000 ? `$${(value / 1000).toFixed(0)}k` : `$${value}`} /><Tooltip formatter={(value) => currency.format(Number(value))} contentStyle={{ border: '1px solid #e8ebe5', borderRadius: 8, fontSize: 12, boxShadow: '0 4px 20px #17241b12' }} /><Area type="monotone" dataKey="total" stroke="#38866b" strokeWidth={2.5} fill="url(#chartFill)" activeDot={{ r: 5, fill: '#38866b', stroke: '#fff', strokeWidth: 3 }} /></AreaChart></ResponsiveContainer>}</div><div className="chart-caption"><span>Last 6 months</span><span>Monthly totals in USD</span></div></article>

              <article className="panel category-panel"><div className="panel-header"><div><p className="section-kicker">WHERE IT GOES</p><h2>Top categories</h2></div><button className="icon-button" title="See all reports" onClick={() => setView('reports')}><ArrowRight size={17} /></button></div><div className="category-list">{report?.categories.length ? report.categories.slice(0, 5).map((item, index) => { const total = report.categories.reduce((sum, current) => sum + current.total, 0); const colors = ['#4b9375', '#9c8063', '#d79b69', '#79a3a0', '#a184a5']; return <div className="category-item" key={item.category}><div className="category-head"><span><i className="category-swatch" style={{ background: colors[index % colors.length] }} />{item.category}</span><strong>{currency.format(item.total)}</strong></div><div className="category-track"><span style={{ width: `${Math.max(3, item.total / total * 100)}%`, background: colors[index % colors.length] }} /></div></div> }) : <div className="empty-category"><span className="empty-icon"><TrendingUp size={18} /></span><strong>No spending to break down yet</strong><p>Your categories will show up here as you add expenses.</p></div>}</div><button className="panel-link" onClick={() => setView('reports')}>Explore spending reports <ArrowRight size={14} /></button></article></section>

            <TransactionsPanel expenses={visibleExpenses.slice(0, 5)} monthLabel={monthLabel} loading={loading} onViewAll={() => setView('transactions')} onRemove={removeExpense} />
          </>}

          {view === 'transactions' && <section className="panel transaction-panel full-transactions"><TransactionsToolbar query={query} setQuery={setQuery} categoryFilter={categoryFilter} setCategoryFilter={setCategoryFilter} onExport={exportCsv} /><TransactionsTable expenses={visibleExpenses} loading={loading} onRemove={removeExpense} /></section>}

          {view === 'reports' && <ReportsView report={report} expenses={expenses} loading={loading} />}

          <footer className="page-footer"><span><ShieldCheck size={13} /> Your financial data is private and encrypted.</span><span>Ledgerly <i /> Built for a clearer month.</span></footer>
        </div>
      </main>
    </div>
  )
}

function TransactionsPanel({ expenses, monthLabel, loading, onViewAll, onRemove }: { expenses: Expense[]; monthLabel: string; loading: boolean; onViewAll: () => void; onRemove: (id: string) => void }) {
  return <section className="panel transaction-panel"><div className="panel-header transactions-heading"><div><p className="section-kicker">THE LATEST</p><h2>Recent transactions</h2></div><button className="panel-link view-all" onClick={onViewAll}>View all <ArrowRight size={14} /></button></div><TransactionsTable expenses={expenses} loading={loading} onRemove={onRemove} emptyLabel={`Nothing recorded in ${monthLabel.toLowerCase()} yet.`} /></section>
}

function TransactionsToolbar({ query, setQuery, categoryFilter, setCategoryFilter, onExport }: { query: string; setQuery: (value: string) => void; categoryFilter: string; setCategoryFilter: (value: string) => void; onExport: () => void }) {
  return <div className="transactions-toolbar"><div className="table-title"><p className="section-kicker">EXPENSE LEDGER</p><h2>All transactions</h2></div><div className="table-controls"><label className="search-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search expenses" /></label><label className="category-filter"><SlidersHorizontal size={14} /><select aria-label="Filter category" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categories.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown size={12} /></label><button className="secondary-button export-button" onClick={onExport}><Download size={15} /> Export CSV</button></div></div>
}

function TransactionsTable({ expenses, loading, onRemove, emptyLabel = 'No expenses yet. Add one to get started.' }: { expenses: Expense[]; loading: boolean; onRemove: (id: string) => void; emptyLabel?: string }) {
  if (loading) return <div className="table-empty"><span className="loader" /> Loading your transactions…</div>
  if (!expenses.length) return <div className="table-empty"><span className="empty-icon"><Coffee size={18} /></span><strong>{emptyLabel}</strong><span>Add an expense whenever you’re ready.</span></div>
  return <div className="table-scroll"><table><thead><tr><th>DESCRIPTION</th><th>CATEGORY</th><th>DATE</th><th className="amount-col">AMOUNT</th><th aria-label="Actions" /></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td><span className={`expense-avatar ${categoryStyle(expense.category)}`}>{categoryIcon(expense.category)}</span><strong className="expense-description">{expense.description}</strong></td><td><span className="category-badge">{expense.category}</span></td><td className="date-cell">{new Date(`${expense.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td><td className="amount-col amount-cell">−{currency.format(expense.amount)}</td><td className="action-cell"><button className="icon-button remove-button" title={`Remove ${expense.description}`} aria-label={`Remove ${expense.description}`} onClick={() => onRemove(expense.id)}><Trash2 size={15} /></button></td></tr>)}</tbody></table></div>
}

function ReportsView({ report, expenses, loading }: { report: Report | null; expenses: Expense[]; loading: boolean }) {
  const bestDay = expenses.reduce<{ date: string; amount: number } | null>((best, expense) => !best || expense.amount > best.amount ? { date: expense.date, amount: expense.amount } : best, null)
  return <>
    <section className="report-intro"><div><span className="report-stamp"><ChartNoAxesCombined size={16} /> YOUR MONTHLY BRIEF</span><h2>A clearer picture,<br /><em>one month at a time.</em></h2><p>Six months of thoughtful tracking. One more useful way to understand your habits.</p></div><div className="brief-stat"><span>ALL-TIME SPENDING</span><strong>{currency.format(report?.total ?? 0)}</strong><small>{report?.count ?? 0} expenses recorded</small></div></section>
    <section className="report-stats"><article><span>THIS MONTH</span><strong>{currency.format(report?.this_month ?? 0)}</strong><small>{report?.this_month && report.last_month && report.this_month < report.last_month ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}{report?.last_month ? `${Math.abs(((report.this_month - report.last_month) / report.last_month) * 100).toFixed(0)}% from last month` : 'Your current month'}</small></article><article><span>AVG. TRANSACTION</span><strong>{currency.format(report?.average ?? 0)}</strong><small><Banknote size={13} /> Across all your purchases</small></article><article><span>LARGEST THIS MONTH</span><strong>{currency.format(bestDay?.amount ?? 0)}</strong><small><ShoppingBag size={13} /> {bestDay ? new Date(`${bestDay.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'No expenses yet'}</small></article></section>
    <section className="content-grid report-content-grid"><article className="panel spending-panel report-chart-panel"><div className="panel-header"><div><p className="section-kicker">SIX-MONTH OVERVIEW</p><h2>Your spending rhythm</h2></div><span className="panel-chip"><span className="legend-dot" /> Total spending</span></div><div className="chart-wrap">{report && <ResponsiveContainer width="100%" height="100%"><AreaChart data={report.monthly} margin={{ top: 12, right: 8, left: -16, bottom: 0 }}><defs><linearGradient id="reportFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#57aa8d" stopOpacity={0.2} /><stop offset="100%" stopColor="#57aa8d" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid vertical={false} stroke="#eceee8" strokeDasharray="3 5" /><XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#8e968c', fontSize: 11 }} dy={9} /><YAxis axisLine={false} tickLine={false} tick={{ fill: '#8e968c', fontSize: 10 }} tickFormatter={(value: number) => `$${value}`} /><Tooltip formatter={(value) => currency.format(Number(value))} contentStyle={{ border: '1px solid #e8ebe5', borderRadius: 8, fontSize: 12 }} /><Area type="monotone" dataKey="total" stroke="#38866b" strokeWidth={2.5} fill="url(#reportFill)" /></AreaChart></ResponsiveContainer>}</div></article><article className="panel report-insight"><span className="insight-mark"><Sparkles size={17} /></span><p className="section-kicker">A SMALL INSIGHT</p><h2>Awareness is<br />a good habit.</h2><p>You’ve logged <strong>{report?.count ?? 0} purchases</strong> so far. That’s a clear view of where your money goes, and a good place to start.</p><div className="insight-rule" /><span className="insight-foot"><Check size={14} /> Keep tracking, at your own pace.</span></article></section>
    <section className="panel report-categories"><div className="panel-header"><div><p className="section-kicker">THIS MONTH, BY CATEGORY</p><h2>Your spending mix</h2></div><span className="report-category-total">{currency.format(report?.this_month ?? 0)} total</span></div>{loading ? <div className="table-empty">Loading report…</div> : report?.categories.length ? <div className="report-category-grid">{report.categories.map((item, index) => <div className="report-category-item" key={item.category}><span className={`expense-avatar ${categoryStyle(item.category)}`}>{categoryIcon(item.category)}</span><span className="report-category-name"><strong>{item.category}</strong><small>{(item.total / Math.max(report.this_month, 1) * 100).toFixed(0)}% of monthly spending</small></span><strong className="report-category-amount">{currency.format(item.total)}</strong></div>)}</div> : <div className="table-empty">Your category breakdown will appear here when you add expenses.</div>}</section>
  </>
}

function categoryStyle(category: string) {
  if (category.includes('Food')) return 'food'
  if (category === 'Transport') return 'transport'
  if (category === 'Shopping') return 'shopping'
  if (category === 'Bills') return 'bills'
  if (category === 'Health') return 'health'
  if (category === 'Travel') return 'travel'
  return 'other'
}

function categoryIcon(category: string) {
  if (category.includes('Food')) return <Utensils size={16} />
  if (category === 'Transport') return <ArrowRight size={16} />
  if (category === 'Shopping') return <ShoppingBag size={16} />
  if (category === 'Bills') return <FileText size={16} />
  if (category === 'Health') return <Check size={16} />
  if (category === 'Travel') return <ArrowUpRight size={16} />
  return <Banknote size={16} />
}

function greeting() {
  const hour = new Date().getHours()
  return hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening'
}