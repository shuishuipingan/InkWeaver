import * as React from 'react'
import { cn } from '../../lib/utils'

/**
 * 统一表单字段 — label + 控件 + 即时校验反馈。
 *
 * 用法：
 *   <Field
 *     label="章节标题"
 *     required
 *     error={errors.title}
 *     hint="建议 4-20 字"
 *   >
 *     <Input
 *       value={title}
 *       onChange={...}
 *       aria-describedby={...}
 *       aria-invalid={!!errors.title}
 *     />
 *   </Field>
 *
 * 无障碍：label 关联控件（id 自动生成）、错误消息带 role="alert"、
 * 必填标记、hint 通过 aria-describedby 关联。
 */
interface FieldProps extends React.HTMLAttributes<HTMLDivElement> {
  /** 字段标签 */
  label: React.ReactNode
  /** 控件 id（默认自动生成） */
  htmlFor?: string
  /** 必填标记 */
  required?: boolean
  /** 错误消息（非空时显示，红色 + role="alert"） */
  error?: React.ReactNode
  /** 辅助说明文字（通过 aria-describedby 关联） */
  hint?: React.ReactNode
  /** 成功提示（绿色对勾场景） */
  success?: React.ReactNode
  /** 标签是否隐藏（仅读屏可见） */
  labelHidden?: boolean
  children?: React.ReactNode
}

export function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  success,
  labelHidden,
  className,
  children,
  ...props
}: FieldProps) {
  const autoId = React.useId()
  const fieldId = htmlFor ?? `field-${autoId.replace(/[:]/g, '')}`
  const errorId = `${fieldId}-error`
  const hintId = `${fieldId}-hint`
  const hasError = !!error

  return (
    <div className={cn('flex flex-col gap-1', className)} {...props}>
      <label
        htmlFor={fieldId}
        className={cn(
          'text-xs font-medium',
          labelHidden && 'sr-only',
        )}
        style={{ color: 'var(--color-text-secondary)' }}
      >
        {label}
        {required && (
          <span className="ml-0.5" style={{ color: 'var(--color-error)' }} aria-hidden="true">*</span>
        )}
      </label>

      {children}

      {success && !hasError && (
        <p className="text-xs" role="status" style={{ color: 'var(--color-success-text)' }}>
          {success}
        </p>
      )}
      {hasError && (
        <p
          id={errorId}
          className="text-xs leading-relaxed"
          role="alert"
          style={{ color: 'var(--color-error-text)' }}
        >
          {error}
        </p>
      )}
      {hint && !hasError && (
        <p id={hintId} className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
          {hint}
        </p>
      )}
    </div>
  )
}

/** 简单错误文本（无需 Field 包裹时的轻量版） */
export function FieldError({ children, className }: { children?: React.ReactNode; className?: string }) {
  if (!children) return null
  return (
    <p className={cn('text-xs leading-relaxed', className)} role="alert" style={{ color: 'var(--color-error-text)' }}>
      {children}
    </p>
  )
}
