import { Context } from '@deepseek-ai/cordis'
import type { ConnectionFetchRoute, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { describe, expect, it, vi } from 'vitest'
import { apply, createAiNovelHostRpcLifecycle, inject } from '../src/index.ts'
import { makeTestWorkspace } from './test-workspace.ts'

describe('preset setup Host RPC', () => {
  it('registers the InkWeaver settings namespace for the Host plugin card', () => {
    const ctx = {
      get: vi.fn((service: string) => service === 'connection'
        ? { fetch: { register: vi.fn(() => async () => {}) } }
        : service === 'workspaceRegistry' ? { get: () => undefined } : undefined),
      inject: vi.fn(),
      effect: vi.fn(),
    } as unknown as Context

    apply(ctx, { presetRoot: 'C:\\InkWeaver\\presets' })

    expect(ctx.inject).toHaveBeenCalledWith(['settings'], expect.any(Function))
  })

  it('keeps WebServer out of the Host plugin dependency contract by using exact shared-API Fetch routes', () => {
    expect(inject).not.toContain('webServer')
  })

  it('rejects new commands during HMR disposal and waits for an in-flight command to settle', async () => {
    let release: (() => void) | undefined
    const started = Promise.withResolvers<void>()
    const pending = new Promise<void>(resolve => { release = resolve })
    const lifecycle = createAiNovelHostRpcLifecycle(async () => {
      started.resolve()
      await pending
      return { ok: true, value: { status: 'settled' } }
    })
    const signal = new AbortController().signal

    const inFlight = lifecycle.handler('preset/status', {}, signal)
    await started.promise
    const disposing = lifecycle.dispose()
    await expect(lifecycle.handler('preset/status', {}, signal)).resolves.toMatchObject({
      ok: false,
      error: { code: 'internal' },
    })
    let settled = false
    void disposing.then(() => { settled = true })
    await Promise.resolve()
    expect(settled).toBe(false)

    release?.()
    await expect(inFlight).resolves.toEqual({ ok: true, value: { status: 'settled' } })
    await expect(disposing).resolves.toBeUndefined()
    expect(settled).toBe(true)
  })

  it('registers exact shared-API routes, dispatches status and install, and disposes them', async () => {
    const presetRoot = await makeTestWorkspace('preset-host-')
    const routes: ConnectionFetchRoute[] = []
    const disposers: Array<() => Promise<void>> = []
    const register = vi.fn((route: ConnectionFetchRoute) => {
      routes.push(route)
      const dispose = vi.fn(async () => {})
      disposers.push(dispose)
      return dispose
    })
    const ctx = new Context()
    ctx.provide('connection', { fetch: { register } } as unknown as HostConnectionHandle)
    ctx.provide('workspaceRegistry' as never, { get: () => undefined } as never)
    ctx.provide('settings' as never, { register: vi.fn() } as never)
    const fiber = ctx.plugin({ inject: [...inject], apply }, { presetRoot })
    await fiber.await()

    expect(routes.some(route => route.path === '/api/inkweaver/preset/status')).toBe(true)
    const dispatch = async (endpoint: string, payload: unknown): Promise<unknown> => {
      const route = routes.find(candidate => candidate.path === `/api/inkweaver/${endpoint}`)
      if (route === undefined) throw new Error(`route missing: ${endpoint}`)
      const response = await route.fetch(new Request(`http://dsh.test${route.path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'client-request', rpcId: `rpc-${endpoint}`, method: `inkweaver/${endpoint}`, payload }),
      }))
      return (await response.json() as { result: unknown }).result
    }
    const signal = new AbortController().signal
    await expect(dispatch('preset/status', {})).resolves.toEqual({
      ok: true,
      value: { status: 'not-installed' },
    })
    await expect(dispatch('preset/install', {})).resolves.toEqual({
      ok: true,
      value: { status: 'installed', changed: true },
    })
    void signal

    await fiber.dispose()
    expect(register).toHaveBeenCalled()
    expect(disposers.every(dispose => (dispose as ReturnType<typeof vi.fn>).mock.calls.length === 1)).toBe(true)
  })

  it('creates a fresh accepting lifecycle when Cordis re-registers the same effect after disposal', async () => {
    const presetRoot = await makeTestWorkspace('preset-host-reregister-')
    const registrations: Array<() => () => Promise<void>> = []
    const register = vi.fn((_route: ConnectionFetchRoute) => {
      return vi.fn(async () => {})
    })
    const ctx = {
      get(service: string): unknown {
        if (service === 'connection') return { fetch: { register } }
        if (service === 'workspaceRegistry') return { get: () => undefined }
        if (service === 'settings') return { register: vi.fn() }
        if (service === 'webServer') return { register: vi.fn(() => async () => {}) }
        throw new Error(`unexpected Host service: ${service}`)
      },
      inject(services: readonly string[], callback: (value: unknown) => void): void {
        callback(services[0] === 'connection'
          ? {
              connection: { fetch: { register } },
              get: (service: string) => service === 'workspaceRegistry' ? { get: () => undefined } : undefined,
              effect: (registration: () => () => Promise<void>) => { registrations.push(registration) },
            }
          : { settings: { register: vi.fn() } })
      },
      effect(registration: () => () => Promise<void>): void {
        registrations.push(registration)
      },
      logger: { error: vi.fn() },
    } as unknown as Context

    apply(ctx, { presetRoot })
    const firstDispose = registrations[0]!()
    await firstDispose()

    expect(register).toHaveBeenCalled()
  })
})
