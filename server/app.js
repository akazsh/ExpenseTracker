import bcrypt from 'bcryptjs'
import cors from 'cors'
import express from 'express'
import jwt from 'jsonwebtoken'

export function createApp({ pool, jwtSecret }) {
  const app = express()

  app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }))
  app.use(express.json({ limit: '32kb' }))

  function createToken(user) {
    return jwt.sign({ sub: String(user.id), email: user.email, name: user.name }, jwtSecret, { expiresIn: '7d' })
  }

  function requireAuth(request, response, next) {
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      return response.status(401).json({ error: 'Sign in to continue.' })
    }
    try {
      request.user = jwt.verify(authorization.slice(7), jwtSecret)
      return next()
    } catch {
      return response.status(401).json({ error: 'Your session expired. Please sign in again.' })
    }
  }

  app.get('/api/health', async (_request, response) => {
    try {
      await pool.query('SELECT 1')
      response.json({ status: 'ok', database: 'connected' })
    } catch {
      response.status(503).json({ status: 'error', database: 'unavailable' })
    }
  })

  app.post('/api/auth/register', async (request, response, next) => {
    try {
      const name = String(request.body.name || '').trim()
      const email = String(request.body.email || '').trim().toLowerCase()
      const password = String(request.body.password || '')
      if (name.length < 2 || name.length > 80 || !/^\S+@\S+\.\S+$/.test(email) || password.length < 8) {
        return response.status(400).json({ error: 'Enter your name, a valid email, and a password of at least 8 characters.' })
      }
      const passwordHash = await bcrypt.hash(password, 12)
      const { rows } = await pool.query(
        'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
        [name, email, passwordHash],
      )
      const user = rows[0]
      return response.status(201).json({ token: createToken(user), user })
    } catch (error) {
      if (error.code === '23505') return response.status(409).json({ error: 'An account with this email already exists.' })
      return next(error)
    }
  })

  app.post('/api/auth/login', async (request, response, next) => {
    try {
      const email = String(request.body.email || '').trim().toLowerCase()
      const password = String(request.body.password || '')
      const { rows } = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email])
      const user = rows[0]
      if (!user || !(await bcrypt.compare(password, user.password_hash))) {
        return response.status(401).json({ error: 'Email or password is incorrect.' })
      }
      return response.json({ token: createToken(user), user: { id: user.id, name: user.name, email: user.email } })
    } catch (error) {
      return next(error)
    }
  })

  app.get('/api/expenses', requireAuth, async (request, response, next) => {
    try {
      const month = String(request.query.month || '')
      const validMonth = /^\d{4}-\d{2}$/.test(month)
      const values = [request.user.sub]
      let monthFilter = ''
      if (validMonth) {
        values.push(month)
        monthFilter = " AND expense_date >= ($2 || '-01')::date AND expense_date < (($2 || '-01')::date + INTERVAL '1 month')"
      }
      const { rows } = await pool.query(
        `SELECT id, description, amount::float AS amount, category, TO_CHAR(expense_date, 'YYYY-MM-DD') AS date
         FROM expenses WHERE user_id = $1${monthFilter} ORDER BY expense_date DESC, id DESC LIMIT 500`,
        values,
      )
      return response.json(rows)
    } catch (error) {
      return next(error)
    }
  })

  app.post('/api/expenses', requireAuth, async (request, response, next) => {
    try {
      const description = String(request.body.description || '').trim()
      const category = String(request.body.category || '').trim()
      const amount = Number(request.body.amount)
      const date = String(request.body.date || '')
      if (!description || description.length > 120 || !category || category.length > 40 || !Number.isFinite(amount) || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return response.status(400).json({ error: 'Enter a description, category, valid date, and amount greater than zero.' })
      }
      const { rows } = await pool.query(
        `INSERT INTO expenses (user_id, description, amount, category, expense_date)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, description, amount::float AS amount, category, TO_CHAR(expense_date, 'YYYY-MM-DD') AS date`,
        [request.user.sub, description, amount.toFixed(2), category, date],
      )
      return response.status(201).json(rows[0])
    } catch (error) {
      return next(error)
    }
  })

  app.delete('/api/expenses/:id', requireAuth, async (request, response, next) => {
    try {
      const { rowCount } = await pool.query('DELETE FROM expenses WHERE id = $1 AND user_id = $2', [request.params.id, request.user.sub])
      if (!rowCount) return response.status(404).json({ error: 'Expense not found.' })
      return response.status(204).end()
    } catch (error) {
      return next(error)
    }
  })

  app.get('/api/reports', requireAuth, async (request, response, next) => {
    try {
      const userId = request.user.sub
      const [monthly, categories, totals] = await Promise.all([
        pool.query(
          `SELECT TO_CHAR(month_start, 'Mon') AS month, TO_CHAR(month_start, 'YYYY-MM') AS key,
                  COALESCE(SUM(e.amount), 0)::float AS total
           FROM generate_series(date_trunc('month', CURRENT_DATE) - INTERVAL '5 months', date_trunc('month', CURRENT_DATE), INTERVAL '1 month') AS month_start
           LEFT JOIN expenses e ON e.user_id = $1 AND date_trunc('month', e.expense_date) = month_start
           GROUP BY month_start ORDER BY month_start`,
          [userId],
        ),
        pool.query(
          `SELECT category, SUM(amount)::float AS total FROM expenses
           WHERE user_id = $1 AND expense_date >= date_trunc('month', CURRENT_DATE) GROUP BY category ORDER BY total DESC`,
          [userId],
        ),
        pool.query(
          `SELECT COALESCE(SUM(amount), 0)::float AS total, COUNT(*)::int AS count,
                  COALESCE(AVG(amount), 0)::float AS average,
                  COALESCE(SUM(amount) FILTER (WHERE expense_date >= date_trunc('month', CURRENT_DATE)), 0)::float AS this_month,
                  COALESCE(SUM(amount) FILTER (WHERE expense_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '1 month' AND expense_date < date_trunc('month', CURRENT_DATE)), 0)::float AS last_month
           FROM expenses WHERE user_id = $1`,
          [userId],
        ),
      ])
      return response.json({ monthly: monthly.rows, categories: categories.rows, ...totals.rows[0] })
    } catch (error) {
      return next(error)
    }
  })

  app.use((error, _request, response, _next) => {
    console.error(error)
    if (error.code === '23503' || error.code === '22007') return response.status(400).json({ error: 'Check the date and try again.' })
    return response.status(500).json({ error: 'Something went wrong. Check the server log for details.' })
  })

  return app
}
