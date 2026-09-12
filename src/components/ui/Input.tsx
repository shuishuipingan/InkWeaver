import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

/**
 * 通用 Input 组件（cva 变体）
 *
 * type="number" 的增强行为：
 * - 编辑中允许清空输入框（不会阻止删除操作）
 * - 失焦时若为空值，自动恢复为 min 属性值（若设置）或 "0"
 * - 业务组件可通过自定义 onBlur 覆盖恢复逻辑
 */

const inputVariants = cva(
  'flex w-full border border-[var(--color-border)] bg-[var(--color-panel)] text-xs text-[var(--color-text)]',
  {
    variants: {
      size: {
        sm: 'h-6 px-2 py-0.5 rounded-[var(--radius-sm)]',
        default: 'h-7 px-2.5 py-1 rounded-[var(--radius-md)]',
        lg: 'h-8 px-3 py-1.5 rounded-[var(--radius-md)]',
      },
      invalid: {
        true: 'border-[var(--color-error)] hover:border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]',
        false: 'hover:border-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]',
      },
    },
    defaultVariants: { size: 'default', invalid: false },
  }
)

type InputVariantProps = VariantProps<typeof inputVariants>

interface InputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'>, InputVariantProps {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, invalid, onBlur, onFocus, ...props }, ref) => {
    // aria-invalid 与 invalid prop 双通道：外部用 aria-invalid 也能触发错误态
    const isInvalid =
      invalid ?? (props['aria-invalid'] === true || props['aria-invalid'] === 'true')

    // 对 number 类型添加 onBlur 空值兜底
    const handleBlur: React.FocusEventHandler<HTMLInputElement> = (e) => {
      if (type === 'number' && e.target.value === '') {
        // 恢复为 min 属性值或 "0"
        const fallback = props.min != null ? String(props.min) : '0'
        // 通过 nativeInputValueSetter 触发 React onChange
        const nativeSet = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype, 'value'
        )?.set
        nativeSet?.call(e.target, fallback)
        e.target.dispatchEvent(new Event('input', { bubbles: true }))
      }
      // 调用业务传入的 onBlur（若有）
      onBlur?.(e)
    }

    return (
      <input
        type={type}
        aria-invalid={isInvalid || undefined}
        className={cn(
          inputVariants({ size, invalid: isInvalid }),
          'placeholder:text-[var(--color-text-muted)]',
          'transition-[border-color,box-shadow,background-color] duration-200 ease-out',
          'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        ref={ref}
        onBlur={handleBlur}
        onFocus={onFocus}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input, inputVariants }
