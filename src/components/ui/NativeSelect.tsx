import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

/** 原生 select 的统一样式封装（轻量替代 Radix Select） */

const nativeSelectVariants = cva(
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

type NativeSelectVariantProps = VariantProps<typeof nativeSelectVariants>

interface NativeSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'>, NativeSelectVariantProps {}

const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, size, invalid, children, ...props }, ref) => {
    const isInvalid =
      invalid ?? (props['aria-invalid'] === true || props['aria-invalid'] === 'true')

    return (
      <select
        aria-invalid={isInvalid || undefined}
        className={cn(
          nativeSelectVariants({ size, invalid: isInvalid }),
          'transition-[border-color,box-shadow,background-color] duration-200 ease-out',
          'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'appearance-none cursor-pointer',
          className
        )}
        ref={ref}
        {...props}
      >
        {children}
      </select>
    )
  }
)
NativeSelect.displayName = 'NativeSelect'

// The style factory is part of the public component API; Fast Refresh's
// component-only export rule does not apply to this intentional helper export.
// eslint-disable-next-line react-refresh/only-export-components
export { NativeSelect, nativeSelectVariants }
