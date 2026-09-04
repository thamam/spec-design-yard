import { describe, test, expect, afterEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { RemoteLoginPage } from '../components/workspace/remote-login'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('RemoteLoginPage', () => {
  test('shows the fail-closed copy when the token file is missing', () => {
    render(<RemoteLoginPage tokenMissing />)
    expect(screen.getByText(/no token file exists/i)).toBeInTheDocument()
    expect(screen.queryByTestId('remote-token-input')).toBeNull()
  })

  test('explains an expired session and signs in with the token', async () => {
    const replace = vi.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { pathname: '/login', replace, href: '/login' },
    })
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ok: true }) }) as any)
    vi.stubGlobal('fetch', fetchMock)

    render(<RemoteLoginPage expired />)
    expect(screen.getByTestId('login-expired')).toBeInTheDocument()
    const input = screen.getByTestId('remote-token-input') as HTMLInputElement
    const submit = screen.getByTestId('remote-login-submit')
    expect(submit).toBeDisabled()
    fireEvent.change(input, { target: { value: '  secret-token  ' } })
    fireEvent.submit(submit.closest('form')!)
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ token: 'secret-token' })
  })

  test('surfaces an API error body and a generic status when json is empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid token' }),
    }) as any))
    render(<RemoteLoginPage />)
    fireEvent.change(screen.getByTestId('remote-token-input'), { target: { value: 'nope' } })
    fireEvent.click(screen.getByTestId('remote-login-submit'))
    expect(await screen.findByTestId('remote-login-error')).toHaveTextContent('Invalid token')

    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => { throw new Error('nope') },
    }) as any))
    fireEvent.change(screen.getByTestId('remote-token-input'), { target: { value: 'again' } })
    fireEvent.click(screen.getByTestId('remote-login-submit'))
    expect(await screen.findByTestId('remote-login-error')).toHaveTextContent('Sign-in failed (500)')
  })

  test('surfaces a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
    render(<RemoteLoginPage />)
    fireEvent.change(screen.getByTestId('remote-token-input'), { target: { value: 'tok' } })
    fireEvent.click(screen.getByTestId('remote-login-submit'))
    expect(await screen.findByTestId('remote-login-error')).toHaveTextContent('Could not reach the workspace')
  })

  test('does not submit while empty or while a request is in flight', async () => {
    let finish!: (v: any) => void
    vi.stubGlobal('fetch', vi.fn(() => new Promise((resolve) => { finish = resolve })))
    render(<RemoteLoginPage />)
    const form = screen.getByTestId('remote-login-submit').closest('form')!
    fireEvent.submit(form)
    expect(screen.getByTestId('remote-login-submit')).toBeDisabled()
    fireEvent.change(screen.getByTestId('remote-token-input'), { target: { value: 'tok' } })
    fireEvent.submit(form)
    await waitFor(() => expect(screen.getByTestId('remote-login-submit')).toHaveTextContent(/signing in/i))
    fireEvent.submit(form)
    finish({ ok: true, status: 200, json: async () => ({ ok: true }) })
  })
})
