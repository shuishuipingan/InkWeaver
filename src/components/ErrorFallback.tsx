import { AlertTriangle, Copy, RefreshCw } from 'lucide-react'

import { useLocaleStore } from '../stores/locale-store'

interface Props {
  label?: string
  errorMessage?: string
  componentStack: string
  onRetry: () => void
  onCopy: () => void
}

/** Function fallback subscribes to the locale independently of the class boundary. */
export default function ErrorFallback({ label, errorMessage, componentStack, onRetry, onCopy }: Props) {
  const text = useLocaleStore(state => state.text)
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
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
            backgroundColor: 'var(--color-hover)', color: 'var(--color-text)', cursor: 'pointer',
            fontSize: '0.8rem', transition: 'background-color var(--transition-fast)',
          }}
          onClick={onRetry}
        >
          <RefreshCw size={12} aria-hidden="true" />
          {text('重试', 'Retry')}
        </button>
        <button
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 16px',
            borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)',
            backgroundColor: 'transparent', color: 'var(--color-text-secondary)', cursor: 'pointer',
            fontSize: '0.8rem', transition: 'background-color var(--transition-fast)',
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
