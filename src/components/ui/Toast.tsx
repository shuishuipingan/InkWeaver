/* eslint-disable react-refresh/only-export-components */
/**
 * InkWeaver 全局 Toast 通知系统 — 适配层
 *
 * 统一通知已收敛到 notification-store + NotificationHost（单一容器、ARIA、
 * 去重、悬停暂停）。本文件保留旧 API 签名，业务代码无需改动：
 *
 *   import { toast } from '@/components/ui/Toast'
 *   toast.success('保存成功')
 *   toast.warning('字数超出限制')
 *   toast.info('提示信息')
 *
 * 容器由 App.tsx 挂载的 <NotificationHost /> 统一渲染。
 */

export { toast } from '../../stores/notification-store'
export type {
  Notification as ToastItem,
  NotificationType as ToastType,
  NotificationAction as ToastAction,
} from '../../stores/notification-store'
