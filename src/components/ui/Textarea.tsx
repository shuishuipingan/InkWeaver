import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '../../lib/utils'

const textareaVariants = cva(
  'flex w-full border border-[var(--color-border)] bg-[var(--color-panel)] text-xs text-[var(--color-text)]',
  {
    variants: {
      size: {
        sm: 'px-2 py-1 rounded-[var(--radius-sm)]',
        default: 'px-2.5 py-1.5 rounded-[var(--radius-md)]',
        lg: 'px-3 py-2 rounded-[var(--radius-md)]',
      },
      invalid: {
        true: 'border-[var(--color-error)] hover:border-[var(--color-error)] focus:border-[var(--color-error)] focus:ring-[var(--color-error)]',
        false: 'hover:border-[var(--color-text-muted)] focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]',
      },
    },
    defaultVariants: { size: 'default', invalid: false },
  }
)

type TextareaVariantProps = VariantProps<typeof textareaVariants>

interface TextareaProps extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'size'>, TextareaVariantProps {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, size, invalid, ...props }, ref) => {
    const isInvalid =
      invalid ?? (props['aria-invalid'] === true || props['aria-invalid'] === 'true')

    return (
      <textarea
        aria-invalid={isInvalid || undefined}
        className={cn(
          textareaVariants({ size, invalid: isInvalid }),
          'placeholder:text-[var(--color-text-muted)]',
          'transition-[border-color,box-shadow,background-color] duration-200 ease-out',
          'focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-[var(--color-bg)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'resize-y min-h-[60px]',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = 'Textarea'

// The style factory is part of the public component API; Fast Refresh's
// component-only export rule does not apply to this intentional helper export.
// eslint-disable-next-line react-refresh/only-export-components
export { Textarea, textareaVariants }
