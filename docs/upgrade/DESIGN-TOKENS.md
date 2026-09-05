# 织墨 InkWeaver 设计令牌规范（DESIGN TOKENS）

> 版本：1.0 · 对应升级模块 M1
> 本文档是 UI 样式的**单一事实来源**。所有组件样式必须引用本规范中的令牌，
> 禁止硬编码颜色 / 半径 / 字号 / 时长 / 层级。

---

## 1. 颜色（`--color-*`，定义于 `src/index.css` @layer base）

### 1.1 语义令牌（组件必须使用）

| 令牌 | 用途 | 浅色主题值（示例） |
|---|---|---|
| `--color-bg` | 应用主背景 | `#F7F3E8` |
| `--color-raised` | 抬升表面（卡片/输入框） | `#FCFAF3` |
| `--color-panel` | 面板表面 | `#F0EADA` |
| `--color-sidebar` | 侧边栏表面 | `#F0EADA` |
| `--color-titlebar` | 标题栏 | `#FCFAF3` |
| `--color-hover` | 悬停表面 | `#EAE3D2` |
| `--color-active` | 按下/选中表面 | `#E3DCC9` |
| `--color-text` | 主文字 | `#2B2A26` |
| `--color-text-secondary` | 次级文字 | `#6E6A5F` |
| `--color-text-muted` | 弱化文字 | `#655F55` |
| `--color-border` | 边框 | `#E3DCC9` |
| `--color-accent` | 强调色（主操作） | `#B5402C` |
| `--color-accent-hover` | 强调色悬停 | `#9A3524` |
| `--color-success` / `--color-success-text` | 成功 | `#527A5B` / `#386042` |
| `--color-warning` / `--color-warning-text` | 警告 | `#C68A3A` / `#7A5414` |
| `--color-error` / `--color-error-text` | 错误 | `#B5402C` / `#8F3020` |
| `--color-info` | 信息 | `#54666E` |
| `--color-editor-bg` | 编辑器背景 | `#FCFAF3` |
| `--color-focus-ring` | 焦点环 | `rgba(181,64,44,0.35)` |
| `--color-backdrop` | 遮罩层 | `rgba(43,42,38,0.25)` |
| `--color-skeleton` | 骨架屏 | `rgba(43,42,38,0.06)` |

> 四个主题（light / paper / galaxy / dark）对以上令牌**全部覆盖**，切换主题即自动换色。
> 组件内引用方式：`style={{ color: 'var(--color-text)' }}` 或 `text-[var(--color-text)]`。

### 1.2 语义提示条配方类（错误/成功/警告/信息条）

```css
.alert-success / .alert-warning / .alert-error / .alert-info
```
用法：`<div className="alert-error text-xs px-3 py-2 rounded-md">…</div>`
**禁止**使用原始调色板 `bg-red-500/10 border-red-500/20`（不跟随暗色主题）。

### 1.3 规则

- ✅ 使用 `var(--color-*)` 语义变量
- ❌ 禁止硬编码 hex（编辑器/CodeMirror 主题与 SVG 图谱除外，需注释说明理由）
- ❌ 禁止原始 Tailwind 语义色族（`bg-red-500`、`text-green-400` 等）

---

## 2. 尺寸

### 2.1 圆角（`--radius-*`）

| 令牌 | 值 | 适用 |
|---|---|---|
| `--radius-sm` | 4px | 小元素内部圆角 |
| `--radius-md` | 6px | 表单控件、常规容器 |
| `--radius-lg` | 8px | 卡片、面板 |
| `--radius-xl` | 12px | 弹窗、大容器 |
| `--radius-2xl` | 16px | 特大容器（设置面板） |

Tailwind 侧已同步：`rounded-sm/md/lg/xl/2xl` 与令牌数值一致。

### 2.2 字号（Tailwind 类）

| 级别 | 值 | 适用 |
|---|---|---|
| `text-2xs` | 10px | 徽标、角标 |
| `text-xs` | 11px | 面板标题、辅助文字（默认小字） |
| `text-sm` | 12px | 常规控件文字 |
| `text-base` | 13px | 正文默认 |
| `text-md` | 14px | 强调正文、表头 |
| `text-lg` | 16px | 弹窗标题、页面标题 |
| `text-xl` | 20px | 大标题 |

**禁止**任意值字号（`text-[0.65rem]`、`text-[11px]` 等）。

### 2.3 图标尺寸（lucide-react `size` prop）

| 级别 | 值 | 适用 |
|---|---|---|
| xs | 12 | 关闭按钮、角标 |
| sm | 14 | Tab 图标、常规列表图标 |
| md | 16 | 按钮图标、面板头部图标 |
| lg | 20 | 空状态图标 |
| xl | 24 | 大图标（欢迎页） |

### 2.4 控件高度

| 级别 | 值 |
|---|---|
| sm | 24px |
| default | 28px |
| lg | 32px |

（`Button` / `Input` / `Textarea` / `NativeSelect` 的 `size` 变体已统一对齐。）

### 2.5 布局常量

| 令牌 | 值 |
|---|---|
| `--height-titlebar` | 40px |
| `--height-statusbar` | 28px |
| `--height-tab` | 36px |
| `--height-panel-header` | 36px |
| `--width-left-bar` | 72px |
| `--width-right-bar` | 44px |

---

## 3. 阴影（`--shadow-*`）

| 令牌 | 适用 |
|---|---|
| `--shadow-sm` | 常规卡片 |
| `--shadow-md` | 悬停抬升 |
| `--shadow-lg` | 大卡片 |
| `--shadow-popover` | 弹窗/浮层 |
| `--shadow-tooltip` | Tooltip |

---

## 4. 动效（时长 / 缓动）

### 4.1 时长（`--dur-*`）

| 令牌 | 值 | 适用 |
|---|---|---|
| `--dur-instant` | 80ms | 按下反馈 |
| `--dur-fast` | 120ms | hover / 颜色过渡 |
| `--dur-base` | 200ms | 进场、展开 |
| `--dur-slow` | 320ms | 面板、弹窗 |
| `--dur-slower` | 500ms | 页面级转场 |

### 4.2 缓动（`--ease-*`）

| 令牌 | 值 |
|---|---|
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-emphasized` | `cubic-bezier(0.2, 0, 0, 1)` |
| `--ease-exit` | `cubic-bezier(0.3, 0, 1, 1)` |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` |

### 4.3 组合令牌（`--motion-*`，transition 专用）

| 令牌 | 组合 |
|---|---|
| `--motion-instant` | 80ms standard |
| `--motion-fast` | 120ms standard |
| `--motion-base` | 200ms standard |
| `--motion-slow` | 320ms emphasized |
| `--motion-slower` | 500ms emphasized |

### 4.4 ⚠️ 关键陷阱

**禁止**把 `--motion-*` 复合值塞进 `animation` 的「时长」槽位 ——
它会被解析为 `animation-delay`（历史 bug：`--transition-spring` 曾导致弹窗 400ms 延迟）。

```css
/* ✅ 正确：时长与缓动分开写 */
animation: dialog-enter var(--dur-slow) var(--ease-spring) both;
/* ❌ 错误：复合值被当作 duration */
animation: dialog-enter 0.25s var(--transition-spring) both;
```

### 4.5 动画类族

- 统一使用 `.anim-*` 类族（`.anim-fade-in` / `.anim-fade-in-up` / `.anim-scale-in` / `.anim-pop-in` / `.anim-expand-down` / `.anim-fade-out` / `.anim-scale-out` / `.anim-stagger`）
- 禁止使用 unlayered 的 `.animate-*` 手写类（会覆盖 Tailwind 同名工具类）
- 动画只动 `transform` / `opacity` / `filter`
- 全局 `prefers-reduced-motion` 兜底自动生效

---

## 5. 层级（`--z-*`）

| 令牌 | 值 | 适用 |
|---|---|---|
| `--z-base` | 0 | 常规内容 |
| `--z-sticky` | 10 | 吸顶 |
| `--z-panel` | 20 | 浮层面板 |
| `--z-overlay` | 100 | 遮罩 |
| `--z-modal` | 200 | 模态弹窗 |
| `--z-popover` | 300 | 弹出层 |
| `--z-toast` | 400 | Toast |
| `--z-tooltip` | 500 | Tooltip（最上层） |

---

## 6. 反馈规范速查

| 场景 | 必须 |
|---|---|
| 成功操作 | `toast.success()`（`role="status"`） |
| 失败操作 | `toast.error()`（`role="alert"`） |
| 危险确认 | `confirm({ danger: true })` |
| 表单错误 | `Field` 组件 + `role="alert"` |
| 加载 >400ms | 骨架屏或 `Button loading` |
| 空数据 | `EmptyState`（title/description/action） |
| 组件崩溃 | `ErrorBoundary` |
