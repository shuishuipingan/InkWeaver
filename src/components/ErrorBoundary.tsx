import { Component } from 'react'
import type { ReactNode, ErrorInfo } from 'react'
import ErrorFallback from './ErrorFallback'
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
