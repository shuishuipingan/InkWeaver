import { Context } from '@deepseek-ai/cordis'
import type { ConnectionRpcHandler, HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import { describe, expect, it, vi } from 'vitest'
import { apply, createAiNovelHostRpcLifecycle, inject } from '../src/index.ts'
import { makeTestWorkspace } from './test-workspace.ts'

describe('preset setup Host RPC', () => {
  it('registers the InkWeaver settings namespace for the Host plugin card', () => {
    const ctx = {
      get: vi.fn(() => undefined),
      inject: vi.fn(),
      effect: vi.fn(),
    } as unknown as Context

    apply(ctx, { presetRoot: 'C:\\InkWeaver\\presets' })

    expect(ctx.inject).toHaveBeenCalledWith(['settings'], expect.any(Function))
  })

  it('registers the loopback RPC only inside a webServer-injected Fiber', () => {
    const ctx = {
      get: vi.fn(() => undefined),
      inject: vi.fn(),
      effect: vi.fn(),
    } as unknown as Context

    apply(ctx, { presetRoot: 'C:\\InkWeaver\\presets' })

    expect(ctx.inject).toHaveBeenCalledWith(['connection', 'webServer'], expect.any(Function))
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

  it('registers one loopback channel, dispatches status and install, and disposes it', async () => {
    const presetRoot = await makeTestWorkspace('preset-host-')
    let handler: ConnectionRpcHandler | undefined
    const dispose = vi.fn(async () => {})
    const handle = vi.fn((channel: string, candidate: ConnectionRpcHandler) => {
      expect(channel).toBe('/inkweaver')
      handler = candidate
      return dispose
    })
    const ctx = new Context()
    ctx.provide('connection', { rpc: { handle } } as unknown as HostConnectionHandle)
    ctx.provide('workspaceRegistry' as never, { get: () => undefined } as never)
    ctx.provide('settings' as never, { register: vi.fn() } as never)
    ctx.provide('webServer' as never, { register: vi.fn(() => async () => {}) } as never)
    const fiber = ctx.plugin({ inject: [...inject], apply }, { presetRoot })
    await fiber.await()

    expect(handler).toBeDefined()
    const signal = new AbortController().signal
    await expect(handler?.('preset/status', {}, signal)).resolves.toEqual({
      ok: true,
      value: { status: 'not-installed' },
    })
    await expect(handler?.('preset/install', {}, signal)).resolves.toEqual({
      ok: true,
      value: { status: 'installed', changed: true },
    })
    await expect(handler?.('unknown', {}, signal)).resolves.toMatchObject({
      ok: false,
      error: { code: 'bad-request' },
    })

    await fiber.dispose()
    expect(dispose).toHaveBeenCalledOnce()
  })

  it('creates a fresh accepting lifecycle when Cordis re-registers the same effect after disposal', async () => {
    const presetRoot = await makeTestWorkspace('preset-host-reregister-')
    const handlers: ConnectionRpcHandler[] = []
    const registrations: Array<() => () => Promise<void>> = []
    const unregister = vi.fn(async () => {})
    const intercept = vi.fn((_channel: string, _matches: unknown, handler: ConnectionRpcHandler) => {
      handlers.push((endpoint, payload, signal) => handler(`inkweaver/${endpoint}`, payload, signal))
      return unregister
    })
    const ctx = {
      get(service: string): unknown {
        if (service === 'connection') return { rpc: { intercept } }
        if (service === 'workspaceRegistry') return { get: () => undefined }
        if (service === 'settings') return { register: vi.fn() }
        if (service === 'webServer') return { register: vi.fn(() => async () => {}) }
        throw new Error(`unexpected Host service: ${service}`)
      },
      inject(services: readonly string[], callback: (value: unknown) => void): void {
        callback(services[0] === 'connection'
          ? {
              connection: { rpc: { intercept } },
              webServer: { register: vi.fn(() => async () => {}) },
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
    const secondDispose = registrations[0]!()

    expect(intercept).toHaveBeenCalledTimes(2)
    await expect(handlers[0]!('preset/status', {}, new AbortController().signal)).resolves.toMatchObject({
      ok: false,
      error: { code: 'internal' },
    })
    await expect(handlers[1]!('preset/status', {}, new AbortController().signal)).resolves.toEqual({
      ok: true,
      value: { status: 'not-installed' },
    })
    await secondDispose()
  })
})
