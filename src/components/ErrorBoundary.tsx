import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import { AlertTriangle, Copy, RefreshCw } from 'lucide-react'
import { useLocaleStore } from '../stores/locale-store'

interface Props {
  children: ReactNode
  fallbackLabel?: string
}

interface State {
  hasError: boolean
  error: Error | null
  componentStack: string
}

/**
 * 全局 Error Boundary — 防止单个组件崩溃导致整个 React 树卸载。
 *
 * 修复：旧版在 class render() 里用 useLocaleStore.getState()（非订阅），
 * 切换语言后错误界面不会刷新。改为函数式错误面板组件 + useLocaleStore() 订阅。
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, componentStack: '' }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary] 组件崩溃:', error, info)
    // 上报到主进程日志（runtime:log），确保组件崩溃可排查
    import('../services/runtime-log').then(({ runtimeLog }) => {
      runtimeLog.error('renderer', 'ErrorBoundary 捕获组件崩溃', {
        error: String(error?.message ?? error),
        stack: String(error?.stack ?? ''),
        componentStack: String(info?.componentStack ?? ''),
      })
    }).catch(() => { /* 日志失败不影响界面 */ })
    this.setState({ componentStack: info.componentStack ?? '' })
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null, componentStack: '' })
  }

  private handleCopyDiagnostics = () => {
    const { error, componentStack } = this.state
    const text = useLocaleStore.getState().text
    const diagnostic = [
      `[${text('织墨诊断', 'InkWeaver diagnostics')}]`,
      String(error?.message ?? error ?? ''),
      String(error?.stack ?? ''),
      componentStack,
    ].filter(Boolean).join('\n')
    void navigator.clipboard?.writeText(diagnostic).catch(() => {})
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          label={this.props.fallbackLabel}
          errorMessage={this.state.error?.message}
          componentStack={this.state.componentStack}
          onRetry={this.handleRetry}
          onCopy={this.handleCopyDiagnostics}
        />
      )
    }
    return this.props.children
  }
}

/** 函数式错误面板 — 订阅 locale，切换语言即时刷新 */
// Fast Refresh cannot classify the local function rendered by the exported
// class boundary; keeping the fallback private is intentional.
// eslint-disable-next-line react-refresh/only-export-components
function ErrorFallback({
  label,
  errorMessage,
  componentStack,
  onRetry,
  onCopy,
}: {
  label?: string
  errorMessage?: string
  componentStack: string
  onRetry: () => void
  onCopy: () => void
}) {
  const text = useLocaleStore(s => s.text)
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: 24,
        backgroundColor: 'var(--color-editor-bg)',
        color: 'var(--color-text)',
      }}
      role="alert"
    >
      <AlertTriangle size={32} aria-hidden="true" style={{ color: 'var(--color-warning)' }} />
      <p style={{ fontWeight: 600, fontSize: 14 }}>
        {label || text('组件渲染出错', 'Component failed to render')}
      </p>
      <pre
        style={{
          fontSize: '0.75rem',
          color: 'var(--color-error-text)',
          backgroundColor: 'color-mix(in srgb, var(--color-error) 10%, transparent)',
          padding: '8px 12px',
          borderRadius: 'var(--radius-md)',
          maxWidth: '100%',
          overflow: 'auto',
          maxHeight: 200,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
        }}
      >
        {errorMessage}
        {'\n'}
        {componentStack}
      </pre>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-hover)',
            color: 'var(--color-text)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            transition: 'background-color var(--transition-fast)',
          }}
          onClick={onRetry}
        >
          <RefreshCw size={12} aria-hidden="true" />
          {text('重试', 'Retry')}
        </button>
        <button
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 16px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--color-border)',
            backgroundColor: 'transparent',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
            fontSize: '0.8rem',
            transition: 'background-color var(--transition-fast)',
          }}
          onClick={onCopy}
        >
          <Copy size={12} aria-hidden="true" />
          {text('复制诊断信息', 'Copy diagnostics')}
        </button>
      </div>
    </div>
  )
}
