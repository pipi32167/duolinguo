import type { ReactNode } from 'react'
import { Alert, Refresh } from './Icons'

export function Loading({ label = '加载中…', rows = 3 }: { label?: string; rows?: number }) {
  return (
    <div aria-busy="true" aria-live="polite" style={{ padding: '8px 0' }}>
      <p className="muted" style={{ fontSize: 13, fontWeight: 800, marginBottom: 12 }}>
        {label}
      </p>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: 68, marginBottom: 10 }} />
      ))}
    </div>
  )
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="alert alert--error" role="alert">
      <Alert />
      <div style={{ flex: 1 }}>
        <b>出错了</b>
        {message}
      </div>
      {onRetry && (
        <button className="iconbtn iconbtn--plain" onClick={onRetry} aria-label="重试" style={{ color: 'inherit' }}>
          <Refresh />
        </button>
      )}
    </div>
  )
}

export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode
  title: string
  hint?: string
  action?: ReactNode
}) {
  return (
    <div className="empty">
      {icon && (
        <span
          style={{
            width: 62,
            height: 62,
            borderRadius: 20,
            display: 'grid',
            placeItems: 'center',
            background: 'var(--soft)',
            color: 'var(--muted)',
          }}
        >
          {icon}
        </span>
      )}
      <b>{title}</b>
      {hint && <span>{hint}</span>}
      {action}
    </div>
  )
}

export function InfoBanner({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: 'info' | 'warn' | 'error' | 'ok'
  title?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={`alert alert--${tone}`}>
      <Alert />
      <div style={{ flex: 1 }}>
        {title && <b>{title}</b>}
        {children}
      </div>
      {action}
    </div>
  )
}

export function Toast({ message }: { message: string | null }) {
  return (
    <div className={`toast${message ? ' is-on' : ''}`} role="status" aria-live="polite">
      {message}
    </div>
  )
}
