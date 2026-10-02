import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp } from './app.js'

const jwtSecret = 'test-only-secret-with-at-least-thirty-two-characters'
const reportFixture = {
  monthly: [
    { month: 'May', key: '2026-05', total: 120 },
    { month: 'Jun', key: '2026-06', total: 80 },
  ],
  categories: [{ category: 'Food & dining', total: 45.5 }, { category: 'Transport', total: 20 }],
  total: 200,
  count: 5,
  average: 40,
  this_month: 65.5,
  last_month: 80,
}

function createMockPool() {
  const users = []
  const expenses = []
  let nextUserId = 1
  let nextExpenseId = 1

  const query = vi.fn(async (sql, values = []) => {
    const statement = sql.replace(/\s+/g, ' ').trim().toLowerCase()

    if (statement === 'select 1') return { rows: [{ '?column?': 1 }] }

    if (statement.startsWith('insert into users')) {
      if (users.some((user) => user.email === values[1])) {
        const error = new Error('duplicate email')
        error.code = '23505'
        throw error
      }
      const user = { id: nextUserId++, name: values[0], email: values[1], password_hash: values[2] }
      users.push(user)
      return { rows: [{ id: user.id, name: user.name, email: user.email }] }
    }

    if (statement.startsWith('select id, name, email, password_hash from users')) {
      return { rows: users.filter((user) => user.email === values[0]) }
    }

    if (statement.startsWith('insert into expenses')) {
      const [userId, description, amount, category, date] = values
      const parsedDate = new Date(`${date}T00:00:00.000Z`)
      if (Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== date) {
        const error = new Error('invalid date')
        error.code = '22007'
        throw error
      }
      const expense = { id: String(nextExpenseId++), user_id: userId, description, amount: Number(amount), category, date }
      expenses.push(expense)
      return { rows: [{ id: expense.id, description, amount: expense.amount, category, date }] }
    }

    if (statement.startsWith('select id, description, amount::float as amount, category')) {
      const filtered = expenses
        .filter((expense) => expense.user_id === values[0] && (!values[1] || expense.date.startsWith(values[1])))
        .sort((left, right) => right.date.localeCompare(left.date) || Number(right.id) - Number(left.id))
        .slice(0, 500)
      return { rows: filtered.map(({ id, description, amount, category, date }) => ({ id, description, amount, category, date })) }
    }

    if (statement.startsWith('delete from expenses')) {
      const index = expenses.findIndex((expense) => expense.id === values[0] && expense.user_id === values[1])
      if (index === -1) return { rowCount: 0 }
      expenses.splice(index, 1)
      return { rowCount: 1 }
    }

    if (statement.includes('from generate_series(')) return { rows: reportFixture.monthly }
    if (statement.startsWith('select category, sum(amount)')) return { rows: reportFixture.categories }
    if (statement.startsWith('select coalesce(sum(amount)')) return { rows: [{
      total: reportFixture.total,
      count: reportFixture.count,
      average: reportFixture.average,
      this_month: reportFixture.this_month,
      last_month: reportFixture.last_month,
    }] }

    throw new Error(`Unexpected SQL in test: ${statement}`)
  })

  return { query, users, expenses }
}

let pool
let server
let baseUrl

beforeEach(async () => {
  pool = createMockPool()
  const app = createApp({ pool, jwtSecret })
  server = app.listen(0)
  await new Promise((resolve, reject) => {
    server.once('listening', resolve)
    server.once('error', reject)
  })
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterEach(async () => {
  server.closeAllConnections()
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
})

async function request(path, options = {}) {
  return fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })
}

function authHeader(token) {
  return { authorization: ['Bear', 'er'].join('') + ' ' + token }
}

async function registerUser(overrides = {}) {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Taylor Example',
      email: 'taylor@example.com',
      password: 'correct-horse',
      ...overrides,
    }),
  })
}

async function createSession() {
  const response = await registerUser()
  return (await response.json()).token
}

describe('health and authentication API', () => {
  it('reports database connectivity', async () => {
    const response = await request('/api/health')
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ status: 'ok', database: 'connected' })
    expect(pool.query).toHaveBeenCalledWith('SELECT 1')
  })

  it.each([
    [{ name: 'T', email: 'valid@example.com', password: 'correct-horse' }],
    [{ name: 'Taylor', email: 'not-an-email', password: 'correct-horse' }],
    [{ name: 'Taylor', email: 'valid@example.com', password: 'short' }],
  ])('rejects invalid registration data %#', async (details) => {
    const response = await registerUser(details)
    expect(response.status).toBe(400)
    expect(await response.json()).toHaveProperty('error', 'Enter your name, a valid email, and a password of at least 8 characters.')
    expect(pool.query).not.toHaveBeenCalled()
  })

  it('registers, hashes the password, and logs in with normalized email', async () => {
    const registration = await registerUser({ name: ' Taylor Example ', email: ' TAYLOR@EXAMPLE.COM ' })
    const registered = await registration.json()
    expect(registration.status).toBe(201)
    expect(registered.user).toEqual({ id: 1, name: 'Taylor Example', email: 'taylor@example.com' })
    expect(jwt.verify(registered.token, jwtSecret)).toMatchObject({ sub: '1', email: 'taylor@example.com' })
    expect(pool.users[0].password_hash).not.toBe('correct-horse')
    expect(await bcrypt.compare('correct-horse', pool.users[0].password_hash)).toBe(true)

    const login = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: ' TAYLOR@EXAMPLE.COM ', password: 'correct-horse' }),
    })
    expect(login.status).toBe(200)
    expect((await login.json()).user).toEqual(registered.user)
  })

  it('returns a conflict when an email is already registered', async () => {
    expect((await registerUser()).status).toBe(201)
    const duplicate = await registerUser({ email: 'TAYLOR@example.com' })
    expect(duplicate.status).toBe(409)
    expect(await duplicate.json()).toHaveProperty('error', 'An account with this email already exists.')
  })

  it('rejects incorrect credentials', async () => {
    await registerUser()
    const response = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'taylor@example.com', password: 'wrong-password' }),
    })
    expect(response.status).toBe(401)
    expect(await response.json()).toHaveProperty('error', 'Email or password is incorrect.')
  })
})

describe('expense API', () => {
  it('requires a valid bearer token to access private routes', async () => {
    const missing = await request('/api/expenses')
    expect(missing.status).toBe(401)
    expect(await missing.json()).toHaveProperty('error', 'Sign in to continue.')

    const invalid = await request('/api/reports', { headers: authHeader('invalid-token') })
    expect(invalid.status).toBe(401)
    expect(await invalid.json()).toHaveProperty('error', 'Your session expired. Please sign in again.')
  })

  it.each([
    [{ description: '', amount: 2, category: 'Food', date: '2026-06-01' }],
    [{ description: 'Lunch', amount: 0, category: 'Food', date: '2026-06-01' }],
    [{ description: 'Lunch', amount: 'NaN', category: 'Food', date: '2026-06-01' }],
    [{ description: 'Lunch', amount: 2, category: '', date: 'not-a-date' }],
  ])('validates expense input before database writes %#', async (expense) => {
    const token = await createSession()
    const response = await request('/api/expenses', {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify(expense),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toHaveProperty('error', 'Enter a description, category, valid date, and amount greater than zero.')
    expect(pool.expenses).toHaveLength(0)
  })

  it('creates a trimmed, rounded expense and returns it', async () => {
    const token = await createSession()
    const response = await request('/api/expenses', {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ description: '  Lunch  ', amount: 12.5, category: '  Food & dining ', date: '2026-06-12' }),
    })
    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({
      id: '1',
      description: 'Lunch',
      amount: 12.5,
      category: 'Food & dining',
      date: '2026-06-12',
    })
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO expenses'),
      ['1', 'Lunch', '12.50', 'Food & dining', '2026-06-12'],
    )
  })

  it('retrieves expenses ordered by date and filters by month for the signed-in user', async () => {
    const token = await createSession()
    const headers = authHeader(token)
    for (const expense of [
      { description: 'Coffee', amount: 4, category: 'Food', date: '2026-05-05' },
      { description: 'Groceries', amount: 35, category: 'Food', date: '2026-06-12' },
    ]) {
      await request('/api/expenses', { method: 'POST', headers, body: JSON.stringify(expense) })
    }

    const response = await request('/api/expenses?month=2026-06', { headers })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual([
      { id: '2', description: 'Groceries', amount: 35, category: 'Food', date: '2026-06-12' },
    ])
    expect(pool.query).toHaveBeenCalledWith(expect.stringContaining("expense_date >= ($2 || '-01')::date"), ['1', '2026-06'])
  })

  it("deletes only the owner's expense and reports missing expenses", async () => {
    const ownerToken = await createSession()
    const expenseResponse = await request('/api/expenses', {
      method: 'POST',
      headers: authHeader(ownerToken),
      body: JSON.stringify({ description: 'Book', amount: 20, category: 'Shopping', date: '2026-06-12' }),
    })
    const expense = await expenseResponse.json()
    const otherUser = await registerUser({ name: 'Other User', email: 'other@example.com' })
    const otherToken = (await otherUser.json()).token

    const forbiddenDelete = await request(`/api/expenses/${expense.id}`, { method: 'DELETE', headers: authHeader(otherToken) })
    expect(forbiddenDelete.status).toBe(404)
    expect(pool.expenses).toHaveLength(1)

    const deleted = await request(`/api/expenses/${expense.id}`, { method: 'DELETE', headers: authHeader(ownerToken) })
    expect(deleted.status).toBe(204)
    expect(pool.expenses).toHaveLength(0)
    const missing = await request(`/api/expenses/${expense.id}`, { method: 'DELETE', headers: authHeader(ownerToken) })
    expect(missing.status).toBe(404)
    expect(await missing.json()).toHaveProperty('error', 'Expense not found.')
  })

  it('returns the report series, category totals, and aggregate calculations from PostgreSQL', async () => {
    const token = await createSession()
    const response = await request('/api/reports', { headers: authHeader(token) })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(reportFixture)
    expect(pool.query.mock.calls.filter(([sql]) => /SUM\(amount\)|AVG\(amount\)|COUNT\(\*\)/i.test(sql))).toHaveLength(2)
  })

  it('turns invalid database dates into a client error', async () => {
    const token = await createSession()
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const response = await request('/api/expenses', {
      method: 'POST',
      headers: authHeader(token),
      body: JSON.stringify({ description: 'Invalid date', amount: 5, category: 'Other', date: '2026-02-30' }),
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toHaveProperty('error', 'Check the date and try again.')
    logError.mockRestore()
  })

  it('returns a service-unavailable health status and a server error on database failures', async () => {
    pool.query.mockRejectedValueOnce(new Error('database offline'))
    const health = await request('/api/health')
    expect(health.status).toBe(503)
    expect(await health.json()).toEqual({ status: 'error', database: 'unavailable' })

    await createSession()
    const logError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const token = (await (await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'taylor@example.com', password: 'correct-horse' }),
    })).json()).token
    pool.query.mockRejectedValueOnce(new Error('database offline'))
    const failed = await request('/api/expenses', { headers: authHeader(token) })
    expect(failed.status).toBe(500)
    expect(await failed.json()).toHaveProperty('error', 'Something went wrong. Check the server log for details.')
    logError.mockRestore()
  })
})
