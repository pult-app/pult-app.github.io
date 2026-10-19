import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasStoredSession } from './api'

const fakeStorage = (keys: string[]) => ({ ...Object.fromEntries(keys.map(k => [k, '{}'])) })

describe('hasStoredSession: вход на устройстве без сети', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('видит сохранённую сессию supabase-js', () => {
    vi.stubGlobal('localStorage', fakeStorage(['pult-tab', 'sb-abcdefgh-auth-token']))
    expect(hasStoredSession()).toBe(true)
  })

  it('не путает с кэшем данных и ключом PKCE', () => {
    vi.stubGlobal('localStorage', fakeStorage(['pult-cache-v1', 'sb-abcdefgh-auth-token-code-verifier']))
    expect(hasStoredSession()).toBe(false)
  })

  it('без доступа к localStorage считает, что входа нет', () => {
    vi.stubGlobal('localStorage', new Proxy({}, { ownKeys() { throw new Error('SecurityError') } }))
    expect(hasStoredSession()).toBe(false)
  })
})
