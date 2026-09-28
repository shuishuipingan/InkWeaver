/**
 * InkWeaver ActionToast — 带操作按钮的增强通知（适配层）
 *
 * 统一通知已收敛到 notification-store + NotificationHost。
 * 本文件保留旧 API 签名，业务代码无需改动：
 *
 *   import { actionToast } from '@/components/ui/ActionToast'
 *   actionToast.show({ type: 'success', message: '✅ 草稿已生成', actions: [...] })
 *   actionToast.workflowComplete('「第一章」已完成', () => openDraft())
 */

export { actionToast } from '../../stores/notification-store'
export type {
  Notification as ActionToastItem,
  NotificationAction as ActionToastAction,
  NotificationType as ActionToastType,
  ShowNotificationOptions as ActionToastOptions,
} from '../../stores/notification-store'
