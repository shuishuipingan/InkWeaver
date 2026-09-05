/**
 * InkWeaver Icon 组件
 *
 * 统一 lucide-react 图标封装，提供标准化的尺寸系统。
 *
 * 图标尺寸规范：
 * - 12px (xs): 状态栏、徽章指示器
 * - 14px (sm): 按钮图标前缀、树形项目图标
 * - 16px (md): 菜单项图标
 * - 18px (lg): 工具窗口栏图标
 * - 22px (xl): 活动栏图标
 *
 * 例外：空状态/欢迎页的「主角装饰图标」可使用 28–36px，
 * 属装饰性内容，不受 5 级规范约束。
 *
 * 用法：
 *   import { Icon } from '@/components/ui/Icon'
 *   import { Sparkles } from 'lucide-react'
 *
 *   <Icon icon={Sparkles} size={14} />   // 数字像素值
 *   <Icon icon={Sparkles} size="sm" />   // 或语义名（xs/sm/md/lg/xl）
 */

import { type LucideProps, type LucideIcon } from 'lucide-react'

export type IconSize = 12 | 14 | 16 | 18 | 22
export type IconSizeName = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const NAMED_SIZES: Record<IconSizeName, IconSize> = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
}

interface IconProps extends Omit<LucideProps, 'ref'> {
  /** 图标名称 */
  icon: LucideIcon
  /** 图标尺寸：像素值或语义名（xs=12 / sm=14 / md=16 / lg=18 / xl=22），默认 14 */
  size?: IconSize | IconSizeName
}

// Size mapping: pixel size -> Tailwind class
const sizeClasses: Record<IconSize, string> = {
  12: 'w-3 h-3',
  14: 'w-3.5 h-3.5',
  16: 'w-4 h-4',
  18: 'w-[18px] h-[18px]',
  22: 'w-[22px] h-[22px]',
}

export function Icon({ icon: IconComponent, size = 14, className, ...props }: IconProps) {
  const resolvedSize: IconSize = typeof size === 'string' ? NAMED_SIZES[size] : size
  return (
    <IconComponent
      className={sizeClasses[resolvedSize] + (className ? ` ${className}` : '')}
      {...props}
    />
  )
}

// Re-export lucide-react types for convenience
export type { LucideProps, LucideIcon }
