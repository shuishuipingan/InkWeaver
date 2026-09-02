# 织墨 / InkWeaver v0.9.2 — 技术现状分析与升级实施方案

> 文档版本：v1.0
> 分析基线：`D:\Game APP\AI-Novel-Writer` @ v0.9.2
> 升级范围：① UI 界面统一 ② 交互动画完善 ③ 用户反馈机制增强 ④ 日志系统完善
> 交付终点：构建打包并覆盖安装至 `D:\Game APP\ai-novel\ai-novel-writer`

---

## 目录

- [第一部分 · 技术现状分析](#第一部分--技术现状分析)
- [第二部分 · 四大升级域诊断](#第二部分--四大升级域诊断)
- [第三部分 · 升级实施方案](#第三部分--升级实施方案)
- [第四部分 · 统一规范清单](#第四部分--统一规范清单)
- [第五部分 · 验收标准与构建流程](#第五部分--验收标准与构建流程)

---

# 第一部分 · 技术现状分析

## 1.1 项目概览

织墨（InkWeaver）是一个**本地优先（local-first）的 Electron 桌面应用**，面向长篇小说创作。它不内置模型，而是作为「创作编排层」：保存项目状态、组织提示词与上下文、管理章节蓝图与草稿版本，并把生成 / 审稿 / 修稿串成一条可追溯的流水线。

| 项 | 值 |
|---|---|
| 产品名 | 织墨 / InkWeaver |
| 版本 | 0.9.2 |
| 许可 | GPL-3.0 |
| 仓库规模 | 渲染进程 49,109 行 / 主进程 47,337 行 / 测试 259 个文件 |

## 1.2 技术栈选型

### 运行时与构建

| 层 | 技术 | 版本 | 说明 |
|---|---|---|---|
| 桌面壳 | Electron | 41.2.0 | `nodeIntegration: false`、`contextIsolation: true`、`frame: false`（自绘标题栏） |
| UI 框架 | React | 19.2.5 | |
| 语言 | TypeScript | 6.0.2 | 严格模式 |
| 构建 | Vite | 8.0.8 | 主进程产物为 CJS |
| 样式 | TailwindCSS | v4.2.2 | `@tailwindcss/vite` 插件，配置即 CSS（无 `tailwind.config.js`） |
| 测试 | Vitest | 4.1.4 | Node 模式 224 个 + Playwright 浏览器模式 35 个 |
| 打包 | electron-builder | 26.8.1 | Windows NSIS / macOS DMG |
| 包管理 | pnpm | 11.11.0 | workspace |

### 关键依赖与选型意图

| 依赖 | 用途 | 选型要点 |
|---|---|---|
| `better-sqlite3` | 项目数据库（`.vela/vela.db`） | 同步 API，WAL 模式；需 `electron-rebuild` 原生重编译 |
| `@lancedb/lancedb` | 向量库（知识库语义检索） | 原生模块，按平台 optionalDependencies 分发 |
| `zustand` | 状态管理 | 12 个 store，仅 2 个用 `persist` |
| `@radix-ui/*` | 无样式交互原语 | dialog / select / tabs / tooltip / label / separator / slot |
| `class-variance-authority` + `tailwind-merge` | 变体管理 | **仅 `Button` 和 `Badge` 使用** |
| `@uiw/react-codemirror` + `@codemirror/*` | 小说正文编辑器 | |
| `monaco-editor` | 差异对比查看器 | |
| `react-resizable-panels` | 可拖拽分栏 | 双层嵌套（外层 vertical / 内层 horizontal） |
| `tailwindcss-animate` | 动画工具类 | **已安装但采用率极低（仅 2 个文件）** |
| `lucide-react` | 图标 | **66 个文件直接 import，尺寸出现 19 种值** |

### 数据持久化分层

```
~/.vela/                          ← 全局配置根（VELA_HOME）
├── prompts/                      ← 提示词
├── logs/                         ← 运行日志（回退目录）
└── ...
<项目路径>/.vela/vela.db          ← 项目数据库（SQLite WAL）
<exe 目录>/logs/                  ← 打包后日志主目录
```

## 1.3 架构分层

```
┌───────────────────────────────────────────────────────────────┐
│  渲染进程 (React 19)                                           │
│                                                                │
│  components/  ← 97 个非测试 .tsx                                │
│      │                                                         │
│  stores/      ← 12 个 zustand store（UI 状态 + 业务状态）         │
│      │                                                         │
│  services/    ← 96 个模块（4 层）                                │
│      ├── workflows/commands/  Command Pattern 业务工作流（13 个）  │
│      ├── generation/          模型调用唯一权威通道（租约制）       │
│      ├── agent/               Agent 循环 + 14 个工具              │
│      └── ipc-client.ts        ↓ 唯一出口                        │
└────────────────────────────────┬───────────────────────────────┘
                                 │  contextBridge
                    window.velaAPI.invoke / on / send
                                 ↓
┌───────────────────────────────────────────────────────────────┐
│  主进程 (Electron 41)                                          │
│                                                                │
│  ipc-handlers.ts  ← installIPCGlobalTracing() 全局 IPC 追踪     │
│      │                                                         │
│  controllers/     ← 17 个控制器，177 个 IPC 通道                 │
│      │                                                         │
│  services/        ← 28 个（LLM / MCP / 向量 / 更新 / 皮肤 …）     │
│  repositories/    ← 21 个 better-sqlite3 仓储                   │
│  llm/             ← 6 个 Provider（OpenAI / Gemini / 兼容端点）   │
│  security/        ← 能力令牌 + 平台安全文件访问                   │
└───────────────────────────────────────────────────────────────┘
```

### 三个值得注意的架构决策

**① 模型执行租约（Lease）机制** — 渲染进程永远拿不到 API Key。`GenerationTask` 用 `?: never` 从类型上禁止传入物理参数：

```ts
export interface GenerationTask {
  purpose: string
  output: GenerationOutput
  messages: readonly GenerationMessage[]
  maxTokens?: never; maxOutputTokens?: never      // ← 刻意禁止
  responseFormat?: never; thinking?: never
}
```
渲染进程只拿到 `modelExecutionLeaseId`，实际调用在主进程完成。

**② 项目会话强制** — `ipc-client.ts` 对 `db:` / `kb:` / `chapter:` / `fs:` 等通道自动追加冻结的 `ProjectSessionContext`，无会话时直接抛错拒绝。

**③ 预算作为产品策略** — `base-command.ts` 把 token 预算定义为品类常量，而非模型属性：

```ts
export const WORKFLOW_GENERATION_BUDGETS = Object.freeze({
  structured: { maxAttempts: 16, maxRequestedOutputTokens: 262_144, deadlineMs: 10*60_000 },
  text:       { maxAttempts: 8,  maxRequestedOutputTokens: 196_608, deadlineMs: 20*60_000 },
})
```

## 1.4 核心业务流程

### 创作主链路

```
前提 → 角色与世界观 → 情节大纲与章节蓝图 → 章节草稿 → 审稿报告 → 修稿与定稿 → 下一章上下文
```

### 13 个业务命令（`src/services/workflows/commands/`）

| 命令 | 行数 | 职责 |
|---|---:|---|
| `architecture` | 1174 | 故事架构生成（最大） |
| `generate-draft` | 938 | 章节草稿生成 |
| `import-novel` | 852 | 小说导入（TXT / EPUB） |
| `finalize-chapter` | 615 | 章节定稿 |
| `directory` | — | 目录蓝图 |
| `review-chapter` / `refine-draft` / `refine-from-review` | — | 审稿与修稿闭环 |
| `generate-field` / `analyze-style` | — | 字段生成 / 文风分析 |
| `legacy-character-roster-repair` | — | 旧版角色名册修复 |

所有命令继承 `base-command.ts`，统一处理重试、预算、取消、进度上报。

### 工作流状态机（`workflow-store.ts`，1054 行）

每 run 的状态：`idle | running | cancelling | completed | failed | paused | waiting`，支持暂停 / 取消 / 资源冲突检测。

## 1.5 代码组织结构

| 目录 | 文件 | 非测试 | 职责 |
|---|---:|---:|---|
| `src/components/` | 233 | 97 | UI 全部（ui 22 / editor 65 / panels 26 / dialogs 12 / settings 16 / layout 6 / pages 2） |
| `src/stores/` | 36 | 12 store + 4 纯函数模块 | zustand 状态 |
| `src/services/` | 154 | 96 | 业务服务（workflows 36 / agent 26 / generation 3） |
| `src/shared/` | — | — | `ipc-channels.ts`（1006 行，177 个通道契约）、`event-bus.ts` |
| `src/i18n/` | 7 | — | 双轨 i18n |
| `src/tokens/` | 2 | — | `spacing.ts`（**死代码**） |
| `electron/` | 179 | — | 主进程 |
| `scripts/` | 62 | — | 构建 / 发布 / 冒烟 |

---

# 第二部分 · 四大升级域诊断

## 2.1 域一：UI 界面一致性

### ✅ 做得好的部分（应保留，不要重做）

- **主题变量层非常扎实**：`--color-*` 共 60 个变量，4 个主题（light / paper / galaxy / dark）**100% 覆盖，无遗漏**。审计逐变量 diff 确认通过。
- **`@layer components` 的交互类层完整**：`.icon-btn` / `.tool-btn` / `.tree-item` / `.left-nav-button` / `.writer-*` 等，含 hover / active / disabled 全套状态。
- **89% 的组件文件已使用 `var(--color-*)`** — 语义色采纳率远高于典型遗留项目。
- **中性色族已清空**：`zinc / gray / slate / neutral / stone` 等全部 0 使用，说明有人刻意治理过。

### ❌ 问题清单

#### P0 — 真实 Bug（用户可感知）

| # | 问题 | 位置 | 证据 |
|---|---|---|---|
| U-1 | **19 个文件用原始调色板，暗色主题下不换色** | `SettingsModal` / `ModelSettings` / `PromptSettings` / `ExportDialog` / `ArchitectureConfirmDialog` / `ChapterCreationDialog` / `PostProcessStatusPanel` 等 | `bg-red-500/10 border-red-500/20`（`red-500` 固定 `#ef4444`，galaxy/dark 下不跟随） |
| U-2 | **`--radius-sm` 与 `--radius-md` 同为 4px** | `index.css:310-311` | 令牌自相矛盾 |
| U-3 | **`FloatingBottomPanel` fallback 值错误** | `FloatingBottomPanel.tsx:84` | `var(--height-panel-header, 32px)`，实际令牌是 36px |
| U-4 | **`SettingsModal` 绕过自家 Dialog 原语** | `SettingsModal.tsx:85-100` | 硬编码 `rgba(0,0,0,0.6)` + `shadow-2xl`，**无焦点陷阱 / 无 ESC / 无 `role="dialog"`** |
| U-5 | **`@theme` 块零颜色令牌** | `index.css:83-201` | `bg-background` / `text-foreground` / `border-border` 等 shadcn 语义类全部不存在 |

#### P1 — 系统性不一致（升级主战场）

| # | 问题 | 量化 |
|---|---:|---|
| U-6 | **半径以 Tailwind 原生 scale 为主**，与项目 `--radius-*` 令牌数值冲突 | `rounded-lg` 76 / `rounded` 73 / `rounded-md` 47 / `rounded-xl` 25；令牌仅 12 个文件用 |
| U-7 | **字号 12 种值**，`--text-2xs` 零采用 | 5 个值挤在 9.6–11.2px（`0.7/0.68/0.65/0.62/0.6rem`）肉眼不可分辨 |
| U-8 | **图标尺寸 19 种值**，`Icon.tsx` 的 5 级规范零采用 | `size={13}` 141 次、`size={14}` 96 次、`size={12}` 96 次… |
| U-9 | **表单控件内距三种**且无 size 变体 API | Input `px-3` / Textarea `px-2.5` / NativeSelect `px-2` |
| U-10 | **面板头部 5 份手写副本** | `.panel-header` 类存在但仅 2 处用；`px-2`/`px-3`、`font-medium`/`font-semibold` 各自不同 |
| U-11 | **841 个内联 `style={{}}` / 68 个文件（70%）** | 样式主力不在 Tailwind 里 → `cn()`/`tailwind-merge` 失效，`hover:`/`dark:` 变体不可用 |
| U-12 | **z-index 三浮层同值** | Toast / Tooltip / ContextMenu 均 `z-[9999]`，靠 DOM 顺序决定层叠；手写弹窗 `z-50` 会被 Toast 压住 |

#### P2 — 死代码

| # | 问题 |
|---|---|
| U-13 | `Skeleton.tsx`（零使用）、`Icon.tsx`（零使用）、`Badge.tsx` / `Tooltip.tsx`（仅 stories） |
| U-14 | `src/tokens/spacing.ts` 完全死代码（0 importer） |
| U-15 | `ActivityBar.tsx`（355 行完整实现）是孤儿组件，无任何 importer，与在用的 `LeftToolWindowBar.tsx` 功能重叠 |
| U-16 | `--writer-*` 别名层（45 个）组件引用为 0 |

## 2.2 域二：交互动画

### ✅ 现有资产

- 36 个 `@keyframes` 已定义，含 `expand-down` / `fade-in-up-soft` / `pop-in-soft` / `draw-line` / `ring-segment-in` / `count-up` / `soft-pulse` 等
- `.anim-*` 自定义类族：30 次使用（`anim-scale-in` 8 / `anim-fade-in-up` 6 / `anim-pop-in` 4 / `anim-modal-*` 8）
- 主题切换用了 **View Transitions API**（`TitleBar.tsx:58-92`，圆形 clip-path 揭示），且**正确检查了 `prefers-reduced-motion`** — 全项目唯一
- `index.css:2060-2068` 有全局 `prefers-reduced-motion` `!important` 兜底

### ❌ 问题清单

#### P0 — 真实 Bug

| # | 问题 | 证据 |
|---|---|---|
| A-1 | **Toast 完全没有进出场动画** | `Toast.tsx:117` 用 `animate-toast-enter` / `animate-toast-exit`，但**这两个类从未定义**（`@keyframes toast-enter` 存在，第 1585/1592 行，无类绑定）→ 硬闪现硬消失 |
| A-2 | **`Confirm` / `AlertDialog` 有 400ms 无响应延迟** | `Confirm.tsx:107`：`animation: 'dialog-enter 0.25s var(--transition-spring) both'`，而 `--transition-spring` 展开为 `0.4s cubic-bezier(...)` → 被解析为 **`animation-delay: 0.4s`**。把 duration 令牌误用作 timing-function |
| A-3 | **`animate-*` 类族为 unlayered**，静默覆盖 Tailwind 同名工具类 | `index.css:1846-1866`（1558 行起为「故意不入层」区）→ `@theme` 定义的 `--animate-fade-in: 0.15s` 实际生效为手写 `0.2s` |

#### P1 — 系统性不一致

| # | 问题 | 量化 |
|---|---:|---|
| A-4 | **三套动画令牌并存，其中一套零采用** | `--transition-*`（5 文件用）；`--dur-*` / `--ease-*`（**0 文件用**，只在 index.css 自引用）；Tailwind 硬编码 `duration-200`×13 |
| A-5 | **页面转场只有进场无退场** | 仅 5 处 `key` 换 DOM 触发 CSS：App(右视图) / Sidebar / BottomPanel / SettingsModal / BottomPanel(run) |
| A-6 | **编辑器 Tab 切换无动画** | `EditorArea.tsx` 靠 `key={activeTab.id}` 硬切换 |
| A-7 | **44 个 `onMouseEnter` + 42 个 `onMouseLeave` 手写处理器** | 用 `e.currentTarget.style.xxx` 直接改 DOM；不可测试、不支持键盘焦点、绕过 `prefers-reduced-motion` |
| A-8 | **7 个微交互工具类零使用** | `.hover-lift` / `.hover-scale` / `.active-press` / `.glow-border` / `.focus-ring` / `.smooth-scroll` / `.row-slide-hover` |
| A-9 | **`@keyframes` 重复定义 3 个**（`bounce-in` / `shimmer` / `fade-in-down`），**2 个未引用**（`skeleton-pulse` / `spin-in`） |
| A-10 | **加载态几乎不存在**：`Skeleton` 零使用，28 处各自实现 `animate-spin` |
| A-11 | **滚动反馈缺失**：无滚动阴影、无回到顶部、无滚动进度指示 |

## 2.3 域三：用户反馈机制

### ✅ 现有资产

- `window.confirm` / `window.alert` **已完全清除**（grep 无命中）— 这点做得干净
- `Confirm.tsx` 的 Promise 风格 API 设计良好：`const ok = await confirm('确定归档？', { danger: true })`
- `ErrorBoundary.tsx` 实现完整（上报主进程 + 可重试 + 组件栈），包裹 5 处
- `StatusBar` 的 AI 任务胶囊：步骤名 + 微型进度条 + 百分比 + 多任务计数 + 完成后 1800ms 完成态
- `PostProcessStatusPanel.tsx`：唯一的细粒度步骤进度组件

### ❌ 问题清单

#### P0 — 真实 Bug

| # | 问题 | 证据 |
|---|---|---|
| F-1 | **两个 Toast 容器位置重叠** | `Toast` 在 `bottom-10 right-5 z-[9999]`，`ActionToast` 在 `bottom-48px right-20px z-[9998]`，垂直仅差 8px |
| F-2 | **两套 Toast 都缺 `role="status"` / `aria-live`** | 对比 `AppearanceSettings.tsx:205` 做对了 |
| F-3 | **`EmptyState` 整体 `opacity: 0.3`** | 内嵌按钮变成 30% 透明，看起来像 disabled；`CharacterEditor` 已用 `as BaseEmptyState` 绕过 |
| F-4 | **`ErrorBoundary.tsx:38` 用 `getState()` 而非订阅** | 切换语言后错误界面不刷新 |

#### P1 — 系统性缺口

| # | 问题 | 量化 |
|---|---:|---|
| F-5 | **三套并行的 Toast 实现，无全局 store** | `Toast` / `ActionToast` / `AlertDialog`+`Confirm` 各自「模块级可变状态 + 独立 React Root + rAF 投递」 |
| F-6 | **无统一加载态**：`Button` 无 `loading` prop，Skeleton 零使用 | 97 个组件无一处骨架屏 |
| F-7 | **无统一 Field / FormError 组件** | 校验消息 4 种写法，仅 1 处 `role="alert"`，1 处误用 `role="status"` |
| F-8 | **空状态覆盖不足** | `EmptyState` 仅 6 个文件使用（8 处）；`EditorArea` 无 Tab、`BottomPanel` 各 tab、`StatsView` 均为手写 |
| F-9 | **ErrorBoundary 仅覆盖 5 处** | TitleBar / 两侧工具栏 / FloatingBottomPanel / 所有 Dialog / 所有 editor 子组件（29 个）均未包裹 |
| F-10 | **18 处中文写死在 `title=` / `aria-label=`** | 英文界面下屏幕阅读器会念中文 |

## 2.4 域四：日志系统

### ✅ 现有资产（比预期好得多）

**`electron/services/runtime-logger.ts`（329 行）已经是一个相当完整的日志器：**

| 能力 | 实现状态 |
|---|---|
| 级别 | `debug / info / warn / error` + `LOG_LEVEL_ORDER` |
| 级别来源 | `process.env.AI_NOVEL_LOG_LEVEL`，默认 `info` |
| 运行时改级别 | `setLevel()` — **存在但外部 0 调用** |
| 文件滚动 | `app-YYYY-MM-DD.log` 按天滚动 |
| 轮转 | 单文件 >10MB 归档为 `.old`，保留最近 10 个 |
| 路径安全 | 文件名白名单正则 `^app-\d{4}-\d{2}-\d{2}\.log(\.old)?$`，不匹配则 throw |
| 脱敏 | `redactSensitive()`，键白名单 `apiKey / token / secret / password / authorization`，递归深度 4 |
| 渲染进程入口 | `registerRuntimeLoggerIPC()` → `runtime:log` 通道 |
| **全局 IPC 追踪** | `installIPCGlobalTracing(ipcMain)` — 猴子补丁 `ipcMain.handle`，记录调用/完成/失败三态 + `elapsedMs` |
| 全局错误钩子 | 主进程 `uncaughtException` / `unhandledRejection`；窗口 `render-process-gone` / `unresponsive`；渲染进程 `error` / `unhandledrejection` |

### ❌ 问题清单

#### P0 — 功能失效（实测确认）

| # | 问题 | 实测证据 |
|---|---|---|
| L-1 | **渲染进程日志 100% 未落盘** | 实测 `~/.vela/logs/` 113 行中，`renderer` source = **0 行**。根因：`ipc-client.ts` 的 6 处 `runtimeLog` 全是 `debug` 级，被默认 `info` 阈值过滤 |
| L-2 | **`runtime-log.ts` 单飞丢弃，吞掉大量日志** | `loggingInFlight` 布尔量：上一条未落地期间的所有日志**静默丢弃**，且 `.catch(() => {})` 吞掉全部失败 |
| L-3 | **`console.log`（29 处）永不落盘** | `main.tsx` 的 console 补丁**只转发 `warn` / `error`** |
| L-4 | **日志被 EPIPE 警告淹没** | 实测单日 28 行中 **15 行（54%）是同一条** `主进程管道写入失败（EPIPE，已忽略）`，无去重无限流 |
| L-5 | **两个同名 `safeConsole` 导出** | `electron/utils/safe-console.ts`（仅控制台）vs `runtime-logger.ts:188`（控制台+镜像文件）。**13 个生产文件全部用前者** → 后者的文件镜像能力是死代码，这是日志中 `console` source = 0 的直接原因 |

#### P1 — 覆盖率极低

| 层 | 非测试模块 | 已接入 | 覆盖率 |
|---|---:|---:|---:|
| `electron/repositories/` | 21 | 0 | **0%** |
| `electron/controllers/` | 17 | 2 | 12% |
| `electron/services/` | 28 | 1（自身） | ~4% |
| `electron/llm/` | 6 | 0 | **0%** |
| `electron/mcp/` | 2 | 0 | **0%** |
| `src/services/` | 96 | 3 | **3%** |
| `src/stores/` | 12 | 2 | 17% |
| `src/components/` | ~230 | 1 | <1% |

```
runtimeLogger 调用点（electron/）：33
runtimeLog    调用点（src/）：      38
console.*     调用点（src/）：       79   ← 29 log / 29 error / 20 warn / 1 info
console.*     调用点（electron/）：  10
```

#### P2 — 缺失能力

| # | 问题 |
|---|---|
| L-6 | **零性能监控埋点**：`performance.now()` 全仓 **0 次**；`performance.mark/measure` **0 次**。仅有的计时在 `traceIPC` 和 `ipc-client`（`Date.now()` 差值） |
| L-7 | **无结构化字段**：格式为纯文本行 ` [时间] [级别] [source] 消息 | {JSON}`，非 JSON Lines，不利于采集 |
| L-8 | **无日志 UI**：`workflow-store` 的 `globalLogs`（内存，保留最近 500 条）**不写文件、不与 `runtimeLog` 打通** |
| L-9 | **脱敏不覆盖路径**：日志中完整写入了 `projectPath` / 用户文档绝对路径。而 `safe-call-diagnostic.ts` 有 `PATH_SHAPED_TEXT` 正则 — **两套脱敏策略不一致** |
| L-10 | **`AppLogger`（`event-bus.ts:128`）为死代码**，0 调用 |
| L-11 | **无运行时级别控制面**：`setLevel()` 无调用方，仅启动时环境变量 |
| L-12 | **无日志查询/导出能力**：用户无法在应用内查看或导出日志 |

---

# 第三部分 · 升级实施方案

## 3.0 总体原则

1. **推广已有令牌，而非重新设计。** 主题变量层（60 个 `--color-*`，四主题 100% 覆盖）和 `@layer components` 交互类层已经很扎实。问题在**组件层对这两层的采用率不一致**（颜色 89%，半径/字号/时长 25%）。升级主线是「推高采用率」。
2. **每项改动必须有明确目的。** 不做纯装饰性改动，不做无收益的重构。
3. **不破坏既有测试。** 259 个测试文件（含 2 个直接引用 `runtimeLogger` 的）必须保持通过。
4. **向后兼容。** 保留所有现有令牌名，新增而非重命名；`prefers-reduced-motion` 全程遵守。
5. **性能优先。** 动画只用 `transform` / `opacity`（GPU 合成层），不触发布局；长列表动效做虚拟化/节流。

## 3.1 模块划分总览

| 模块 | 名称 | 域 | 优先级 |
|---|---|---|---|
| **M1** | 设计令牌统一 | UI | P0 |
| **M2** | UI 组件规范化 | UI | P0 |
| **M3** | 面板/弹窗结构统一 | UI | P1 |
| **M4** | 动画系统重建 | 动画 | P0 |
| **M5** | 交互反馈动效 | 动画 | P1 |
| **M6** | 通知系统统一 | 反馈 | P0 |
| **M7** | 表单校验 / 空状态 / 错误边界 | 反馈 | P0 |
| **M8** | 日志系统完善 | 日志 | P0 |

---

## M1 · 设计令牌统一

### 目的
解决「三套动画令牌并存」「半径/字号碎片化」「语义色配方不一致」三个根因问题，为后续所有模块提供单一事实来源。

### 改动内容

**1.1 补齐 `@theme` 颜色映射（解决 U-5）**

在 `index.css` 的 `@theme` 块中把 `--color-*` CSS 变量映射为 Tailwind 颜色命名空间，使 `bg-background` / `text-foreground` / `border-border` 等语义类可用，并解锁 `tailwind-merge` 的完整能力：

```css
@theme {
  --color-background: var(--color-bg);
  --color-foreground: var(--color-text);
  --color-muted: var(--color-surface);
  --color-muted-foreground: var(--color-text-muted);
  --color-border: var(--color-border);
  --color-primary: var(--color-accent);
  --color-success: var(--color-success);
  --color-warning: var(--color-warning);
  --color-error: var(--color-error);
  --color-info: var(--color-info);
}
```
> 保留原有 `var(--color-*)` 全部变量名，纯增量。

**1.2 统一动画令牌（解决 A-4）**

确立**单一**时长/缓动体系，废弃零采用的 `--dur-*` / `--ease-*` 与语义重复的 `--transition-*`：

```css
:root {
  /* 时长 —— 唯一真源 */
  --dur-instant: 80ms;    /* 按下反馈 */
  --dur-fast:    120ms;   /* hover / 颜色过渡 */
  --dur-base:    200ms;   /* 进场、展开 */
  --dur-slow:    320ms;   /* 面板、弹窗 */
  --dur-slower:  500ms;   /* 页面级转场 */

  /* 缓动 —— 唯一真源 */
  --ease-standard:   cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: cubic-bezier(0.2, 0, 0, 1);
  --ease-exit:       cubic-bezier(0.3, 0, 1, 1);
  --ease-spring:     cubic-bezier(0.34, 1.56, 0.64, 1);

  /* 组合令牌 —— 供 transition 直接用（关键：顺序固定为 时长 缓动） */
  --motion-fast:   var(--dur-fast) var(--ease-standard);
  --motion-base:   var(--dur-base) var(--ease-standard);
  --motion-slow:   var(--dur-slow) var(--ease-emphasized);
}
```

**⚠️ 关键修复（A-2）**：`--transition-spring` 现在会被**删除**。它是一个 duration+easing 的复合值（`0.4s cubic-bezier(...)`），被误用为 `animation` 的第二个位置参数时会被解析成 `animation-delay`。所有用法改为显式书写：
```css
/* 错误 */ animation: dialog-enter 0.25s var(--transition-spring) both;
/* 正确 */ animation: dialog-enter var(--dur-base) var(--ease-spring) both;
```

**1.3 统一半径 / 字号 / 图标尺寸（解决 U-2 / U-6 / U-7 / U-8）**

```css
:root {
  --radius-sm: 4px;   --radius-md: 6px;   /* ← 修正：原 sm/md 同为 4px */
  --radius-lg: 8px;   --radius-xl: 12px;  --radius-2xl: 16px;
}
```
在 `@theme` 中同步注册，使 `rounded-sm/md/lg` 与项目令牌数值一致：
```css
@theme {
  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px; --radius-xl: 12px; --radius-2xl: 16px;
}
```

字号收敛为 7 级（原 12 级）：
```
2xs 10px  · xs 11px  · sm 12px  · base 13px  · md 14px  · lg 16px  · xl 20px
```

图标尺寸收敛为 5 级（原 19 种）：
```
xs 12px · sm 14px · md 16px · lg 20px · xl 24px
```

**1.4 新增语义色「配方」工具类（解决 U-1）**

提供统一的语义提示条配方，替代 19 个文件中散落的 `bg-red-500/10 border-red-500/20`：

```css
@layer components {
  .alert-success { background: color-mix(in srgb, var(--color-success) 12%, transparent);
                   border: 1px solid color-mix(in srgb, var(--color-success) 24%, transparent);
                   color: var(--color-success-text); }
  .alert-warning { /* 同构，--color-warning */ }
  .alert-error   { /* 同构，--color-error */ }
  .alert-info    { /* 同构，--color-info */ }
}
```

**1.5 统一的 z-index 层级（解决 U-12）**

```css
:root {
  --z-base: 0;      --z-sticky: 10;   --z-panel: 20;
  --z-overlay: 100; --z-modal: 200;   --z-popover: 300;
  --z-toast: 400;   --z-tooltip: 500; /* Tooltip 必须最上层 */
}
```

**1.6 删除死代码**
- 删除 `src/tokens/spacing.ts`（0 importer）
- 删除 `ActivityBar.tsx`（孤儿组件，355 行，与在用的 `LeftToolWindowBar` 重叠）
- 清理未引用的 `@keyframes`：`skeleton-pulse`（改为 M6 实际使用）、`spin-in`
- 去重 `bounce-in` / `shimmer` / `fade-in-down` 三对重复定义

### 实现方式
集中在 `src/index.css`（`@theme` + `@layer base` + `@layer components`），产出一份 `docs/upgrade/DESIGN-TOKENS.md` 作为规范文档。

### 预期收益
- 消除 4 个真实 Bug（U-1 / U-2 / U-5 / A-2 的令牌根因）
- 半径/字号/时长从 12 / 12 / 3 套收敛到 1 / 7 / 1 套
- 后续所有模块的样式决策有单一事实来源，可验收

---

## M2 · UI 组件规范化

### 目的
把 M1 的令牌推广到 22 个 UI 原语，消除「三种表单控件三种内距」「Button 有 cva 其余全无」的不一致。

### 改动内容

**2.1 表单控件统一（解决 U-9）**

`Input` / `Textarea` / `NativeSelect` 全部引入 `cva`，统一：
- 内距统一为 `px-2.5`（与 Button `sm` 视觉对齐）
- 增加 `size` 变体：`sm`（24px）/ `default`（28px）/ `lg`（32px），与 Button 三级对齐
- 增加统一的 `invalid` 变体：`aria-invalid=true` 时自动应用错误边框 + `alert-error` 配方
- 统一 `:focus-visible` 焦点环（消除与 `index.css:513-524` 的双份定义）

**2.2 推广 `cva` 到剩余组件**

`Toast` / `Dialog` / `Confirm` / `AlertDialog` / `EmptyState` / `Switch` / `ContextMenu` / `MenuItem` / `IconBtn` / `Tooltip` — 目前 22 个组件中仅 2 个使用 `cva`。

**2.3 内联样式迁移（解决 U-11）**

将可静态化的内联 `style={{ color: 'var(--color-text-muted)' }}` 迁移为 Tailwind 任意值类 `text-[var(--color-text-muted)]`。

> **范围控制**：841 个内联样式块不做全量迁移（风险过高、收益递减）。**只迁移 3 类**：
> 1. 纯静态颜色（`color` / `backgroundColor` / `borderColor`）→ `text-[var(--...)]` 等
> 2. 纯静态尺寸（`height: 'var(--height-panel-header)'`）→ `h-[var(--height-panel-header)]`
> 3. **必须保留内联的**：动态计算值、CodeMirror/Monaco 主题、SVG 图谱坐标

**2.4 图标尺寸统一（解决 U-8）**

推广 `Icon.tsx` 的 5 级规范，配合 ESLint 规则禁止裸 `size={13}` 这类魔数。

**2.5 修复具体 Bug**

| Bug | 修复 |
|---|---|
| U-3 | `FloatingBottomPanel.tsx:84` 的 `var(--height-panel-header, 32px)` → 去掉错误 fallback |
| U-1 | `PostProcessStatusPanel.tsx` 的 8 个 hex + 8 处 `bg-*-500/8` → 改用 M1.4 的 `.alert-*` 配方 |
| — | `WelcomePage.tsx:30` 硬编码棕色阴影 `rgba(82,52,22,0.18)` → 改用主题阴影令牌 |

### 实现方式
逐文件改造 `src/components/ui/*.tsx`，每组件保持 API 向后兼容（不删 prop，只加）。

### 预期收益
- 表单控件从 3 种内距/0 个 size 变体 → 1 种内距/3 个 size 变体，且带统一校验态
- `cn()` / `tailwind-merge` 恢复生效（覆盖 M2.3 迁移的样式）
- 消除 3 处硬编码 hex 与 1 处硬编码阴影

---

## M3 · 面板 / 弹窗结构统一

### 目的
消除「面板头部 5 份手写副本」「弹窗 Radix 与手写五五分」「SettingsModal 无焦点陷阱」。

### 改动内容

**3.1 新增 `<PanelHeader>` 共享组件（解决 U-10）**

```tsx
<PanelHeader                          // 统一：h-36px, px-3, border-b, uppercase, text-muted
  title={...}
  actions={...}                        // 右侧操作区
  className={...}
/>
```
替换 5 处手写副本：`AIOutputPanel` / `BottomPanel` / `StatsView` / `FloatingBottomPanel` / `agent/AgentHeader`，以及已用 `.panel-header` 类的 2 处。

**3.2 弹窗统一到 Radix 原语（解决 U-4）**

- `SettingsModal` / `AIRenameCharactersDialog` / `AITitleSynopsisDialog` / `ClearProjectDataDialog` 四个手写 `fixed inset-0` 迁移到 `ui/Dialog`。
- **收益**：免费获得焦点陷阱、ESC 关闭、`role="dialog"` / `aria-modal`、滚动锁定、`prefers-reduced-motion` 支持。
- 硬编码 `rgba(0,0,0,0.6)` → `var(--color-backdrop)`；`shadow-2xl` → `var(--shadow-popover)`；`rounded-2xl` → `rounded-[var(--radius-2xl)]`。

**3.3 面板底部统一**

新增 `<PanelFooter>`，统一 32px 高、`px-3`、顶部边框、右侧操作区布局。

### 实现方式
新增 `src/components/ui/PanelHeader.tsx` / `PanelFooter.tsx`；改造 7 个面板 + 4 个弹窗。

### 预期收益
- 面板头部从 5 份手写副本（4 组不一致）→ 1 个组件
- 4 个手写弹窗获得完整无障碍与键盘支持
- 消除 3 处硬编码阴影/背景

---

## M4 · 动画系统重建

### 目的
修复 3 个动画 Bug，统一动画类族，建立可复用的动效层。

### 改动内容

**4.1 修复 3 个 P0 Bug**

| Bug | 修复 |
|---|---|
| A-1 | 在 `index.css` 中定义 `.animate-toast-enter` / `.animate-toast-exit` 类，绑定到已存在的 `@keyframes toast-enter/exit`（第 1585/1592 行） |
| A-2 | `Confirm.tsx:107` / `AlertDialog.tsx:106` 的 `var(--transition-spring)` → `var(--dur-base) var(--ease-spring)`，消除 400ms 延迟 |
| A-3 | 删除 unlayered 的 `.animate-fade-in` / `.animate-fade-in-up` / `.animate-scale-in` / `.animate-bounce-in`（`index.css:1846-1866`），保留 `@theme` 中定义的标准版本 |

**4.2 统一动画类族**

确立 `.anim-*` 为项目唯一动画类族（30 次使用 vs 4 次），补齐退场动画：

```css
/* 进场 */
.anim-fade-in      { animation: fade-in      var(--dur-base) var(--ease-standard) both; }
.anim-fade-in-up   { animation: fade-in-up   var(--dur-slow) var(--ease-emphasized) both; }
.anim-scale-in     { animation: scale-in     var(--dur-base) var(--ease-spring) both; }
.anim-pop-in       { animation: pop-in-soft  var(--dur-slow) var(--ease-spring) both; }
.anim-expand-down  { animation: expand-down  var(--dur-base) var(--ease-emphasized) both; }
/* 退场（新增） */
.anim-fade-out     { animation: fade-out     var(--dur-fast) var(--ease-exit) both; }
.anim-scale-out    { animation: scale-out    var(--dur-fast) var(--ease-exit) both; }
/* 列表 stagger（新增） */
.anim-stagger > *  { animation: fade-in-up-soft var(--dur-base) var(--ease-emphasized) both; }
.anim-stagger > *:nth-child(1) { animation-delay: 0ms; }
/* … 到第 8 项，超出后共用第 8 项延迟，避免长列表延迟过长 */
```

**4.3 页面 / 视图转场（解决 A-5 / A-6）**

新增 `<ViewTransition>` 组件，统一「进场 + 退场」编排：

```tsx
<ViewTransition transitionKey={activeTabId}>
  {/* 内容 */}
</ViewTransition>
```
实现：双缓冲 —— 退场节点保留 `--dur-fast` 后卸载，进场节点立即挂载。只动 `opacity` / `transform`。

应用到：编辑器 Tab 切换（A-6）、侧边栏视图、底栏 Tab、设置面板分区、右视图切换。

**4.4 滚动动效（解决 A-11）**

新增 `useScrollShadow` hook：容器滚动时在顶/底显示渐变阴影（纯 CSS `mask` + 滚动位置驱动的 CSS 变量，不触发重排）。
新增 `<ScrollArea>` 组件，统一滚动条样式与滚动阴影。

**4.5 性能保障**

- 所有动画只动 `transform` / `opacity` / `filter`（GPU 合成层）
- 全局 `prefers-reduced-motion` 兜底（已存在于 `index.css:2060`，扩展到覆盖新动画）
- 长列表 stagger 限制最多 8 项延迟
- `will-change` 仅在动画期间通过 `animation` 隐式启用，不做常驻声明

### 实现方式
`src/index.css`（类族定义）+ 新增 `src/components/ui/ViewTransition.tsx` / `ScrollArea.tsx` / `src/hooks/useScrollShadow.ts`。

### 预期收益
- 修复 3 个真实 Bug（Toast 硬闪现、Confirm 400ms 卡顿、animate 类覆盖）
- 动画类族从 2 套 → 1 套，补齐退场动画
- 编辑器 Tab 切换（最高频交互）获得转场反馈

---

## M5 · 交互反馈动效

### 目的
覆盖页面过渡、悬停反馈、加载状态、滚动效果，同时用 CSS 变体替代 86 个手写鼠标处理器。

### 改动内容

**5.1 悬停反馈统一（解决 A-7 / A-8）**

原则：**优先用 Tailwind 变体，其次用已有 `.hover-*` 类，禁止 `onMouseEnter` 改 DOM。**

新增统一的微交互工具类并**实际推广使用**（当前 7 个零使用）：
```css
.hover-lift     { transition: transform var(--dur-fast) var(--ease-standard),
                              box-shadow var(--dur-fast) var(--ease-standard); }
.hover-lift:hover { transform: translateY(-1px); box-shadow: var(--shadow-md); }
.active-press:active { transform: scale(0.97); }
.focus-ring:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
```

**重点改造 `WelcomePage.tsx`**：三个卡片各自手写同样的 hover 逻辑（只差颜色）→ 统一为一个 `data-accent` 属性驱动的类。

**5.2 加载状态（解决 A-10 / F-6）**

- **激活 `Skeleton.tsx`**（当前零使用），补齐 `variant`：`text` / `card` / `table` / `avatar`，使用已有的 `shimmer` keyframes
- **Button 增加 `loading` prop**：显示 spinner + 自动 `disabled` + `aria-busy`
- 推广到：项目树加载、章节列表加载、AI 输出流式等待、模型列表获取

**5.3 按钮与列表项动效**

- 按钮：`:active` 缩放 `0.97`（80ms）
- 列表项：`.row-slide-hover` 已存在，推广到项目树、章节列表、角色列表

**5.4 动效触发时机总表**

| 动效 | 触发时机 | 时长 | 缓动 | 实现 |
|---|---|---|---|---|
| 按钮按下 | `:active` | 80ms | standard | `active-press` 类 |
| 卡片悬停 | `:hover` | 120ms | standard | `hover-lift` 类 |
| 列表项悬停 | `:hover` | 120ms | standard | `row-slide-hover` 类 |
| 焦点环 | `:focus-visible` | 0ms | — | `focus-ring` 类 |
| Toast 进场 | 挂载 | 200ms | spring | `.animate-toast-enter` |
| Toast 退场 | 卸载前 300ms | 150ms | exit | `.animate-toast-exit` |
| 弹窗进场 | 挂载 | 200ms | spring | `dialog-enter` |
| 弹窗退场 | 关闭 | 150ms | exit | `dialog-exit` |
| 视图转场 | 切换 | 200ms（退 80ms） | emphasized | `ViewTransition` |
| 面板展开 | 展开 | 200ms | emphasized | `anim-expand-down` |
| 列表 stagger | 挂载 | 200ms（延迟 0–280ms） | emphasized | `.anim-stagger` |
| 骨架屏 | 加载中 | 2s 循环 | linear | `shimmer` |
| 滚动阴影 | 滚动 | 120ms | standard | CSS 变量驱动 |
| 主题切换 | 点击 | 450ms | standard | View Transitions API（已有） |

### 实现方式
`src/index.css` + `src/components/ui/*`（Button / Skeleton）+ 改造 86 个手写鼠标处理器集中的 10 个文件。

### 预期收益
- 86 个手写鼠标处理器 → CSS 变体（可测试、支持键盘、遵守 reduced-motion）
- 7 个零使用微交互类全部投入实际使用
- 加载态从「空白 + 28 处各自 spinner」→ 统一骨架屏 + Button loading

---

## M6 · 通知系统统一

### 目的
把三套并行的 Toast 实现收敛为一套，修复位置重叠与无障碍缺失。

### 改动内容

**6.1 建立全局通知 store（解决 F-5）**

新增 `src/stores/notification-store.ts`（zustand），统一管理所有通知：
```ts
interface Notification {
  id: string
  type: 'success' | 'error' | 'warning' | 'info'
  message: string
  title?: string
  duration: number          // 0 = 常驻
  actions?: NotificationAction[]
  progress?: number         // 0-1，用于长任务
  createdAt: number
  dismissible: boolean
}
```

**6.2 统一 Toast 渲染（解决 F-1 / F-2）**

- 单一容器 `<NotificationHost />`，挂载在 `App.tsx` 根部，**替代** `#vela-toast-root` 与 `#vela-action-toast-root` 两个容器
- 统一位置：右下角，间距 8px，堆叠时后续项向下偏移 + 整体轻微缩放（经典 stack 效果）
- `role="status"` + `aria-live="polite"`（success/info/warning）；`role="alert"` + `aria-live="assertive"`（error）
- 统一动画：进场 `toast-enter` 200ms spring，退场提前 300ms 触发 `toast-exit` 150ms

**6.3 保持 API 向后兼容**

现有 17 个文件的 `toast.success(...)` 等调用**全部保持不变**，通过适配层转发到新 store。`actionToast.show(...)` / `actionToast.workflowComplete(...)` 同样保留。

**6.4 通知增强**

- **进度通知**：长任务（导入、批量生成）显示进度条
- **操作按钮**：`actionToast` 的 action 能力下沉到统一通知，所有通知都支持
- **去重**：相同 `message` + `type` 在 2s 内重复 → 合并计数（`×3`）
- **上限**：最多同时显示 4 条，超出排队
- **暂停**：鼠标悬停时暂停自动关闭计时

### 实现方式
新增 `src/stores/notification-store.ts` + `src/components/ui/NotificationHost.tsx`；改造 `Toast.tsx` / `ActionToast.tsx` 为适配层。

### 预期收益
- 3 套实现 → 1 套；2 个重叠容器 → 1 个
- 全部通知获得 ARIA 播报
- 新增进度通知、去重、悬停暂停能力

---

## M7 · 表单校验 / 空状态 / 错误边界

### 目的
建立统一的即时反馈层，让每次用户操作都有清晰、一致的状态反馈。

### 改动内容

**7.1 统一 Field 组件（解决 F-7）**

新增 `src/components/ui/Field.tsx`：
```tsx
<Field
  label="章节标题"
  required
  error={errors.title}          // 有值时自动应用 error 态
  hint="建议 4-20 字"
  hintId="chapter-title-hint"
>
  <Input aria-describedby="chapter-title-hint" aria-invalid={!!errors.title} />
</Field>
```
统一处理：`label` 关联、`aria-describedby`、`aria-invalid`、`role="alert"` 错误消息、必填标记、字数统计。

**7.2 即时校验反馈**

- 校验时机：`onBlur` 首次校验 → `onChange` 实时重校验（仅在已校验过后）
- 成功态：绿色对勾 + `aria-live` 播报
- 错误态：红色边框 + 错误消息 `role="alert"`
- 异步校验（如模型名查重）：显示 inline spinner，完成后 300ms 内淡入结果

**7.3 空状态统一（解决 F-3 / F-8）**

重写 `EmptyState.tsx`：
- **移除整体 `opacity: 0.3`**（改用 `text-muted` 控制文字层级，图标用独立低透明度）
- 增加 `size` 变体：`sm`（卡片内）/ `default`（面板）/ `lg`（整页）
- 增加 `title` / `description` 分层
- 增加 `action` 插槽（主操作按钮，不再被透明度影响）

覆盖新增场景：`EditorArea` 无 Tab、`BottomPanel` 各 tab、`StatsView` 未打开项目。

**7.4 错误边界扩展（解决 F-4 / F-9）**

- 修复 `ErrorBoundary.tsx:38`：`useLocaleStore.getState()` → 组件内订阅
- 包裹范围从 5 处扩展到：TitleBar、LeftToolWindowBar、RightToolWindowBar、FloatingBottomPanel、所有 Dialog 内容、editor 子组件
- 统一错误 UI：图标 + 标题 + 描述 + 重试/复制诊断/查看日志 三个操作
- 错误自动上报 `runtimeLog.error`（与 M8 打通）

**7.5 表单提交状态**

统一 `submitting` 态：提交中禁用表单 + Button `loading` + 防重复提交；失败后聚焦第一个错误字段。

### 实现方式
新增 `Field.tsx`；重写 `EmptyState.tsx` / `ErrorBoundary.tsx`；改造 4 种手写校验消息处。

### 预期收益
- 校验消息从 4 种写法 → 1 个组件，100% 带 `role="alert"`
- 空状态覆盖从 8 处 → 12+ 处，内嵌按钮不再像 disabled
- 错误边界覆盖从 5 处 → 全覆盖，且语言切换正常

---

## M8 · 日志系统完善

### 目的
修复「渲染进程日志 0 落盘」等 5 个失效问题，把覆盖率从 3% 提升到可用水平，并补齐性能监控。

### 改动内容

**8.1 修复 5 个 P0 失效（解决 L-1 ~ L-5）**

| # | 修复方案 |
|---|---|
| L-1 | `ipc-client.ts` 的 6 处 `debug` 日志提升到 `info`；并把默认级别在开发环境降为 `debug`。同时新增渲染进程日志批量上报（见 8.2） |
| L-2 | 重写 `runtime-log.ts`：用**有界队列**替代单飞布尔量（容量 200，溢出丢弃最旧并计数），批量 flush（每 200ms 或队列达 20 条），`catch` 时降级到 console 而非静默 |
| L-3 | `main.tsx` 的 console 补丁扩展为转发 `info`（`log` 仍只在 debug 级别转发，避免膨胀），并给 `console.*` 打上 `source='console'` |
| L-4 | EPIPE 警告改为**去重 + 限流**：同一消息 60s 内最多记录 1 次，并显示 `[重复 N 次]` |
| L-5 | 统一 `safeConsole` 为单一导出（保留 `runtime-logger.ts` 的镜像文件版本），把 13 个生产文件的导入切到统一入口 |

**8.2 结构化日志格式（解决 L-7）**

保留现有可读格式，同时新增**结构化字段**，便于后续采集：
```
[2026-09-01 21:05:59.650] [INFO] [renderer:project-store] 保存项目成功 | {"projectId":"…","elapsedMs":42,"seq":1234}
```
新增字段：`seq`（进程内自增序号，用于检测丢失）、`pid`、`sessionId`（启动实例 ID）。

**8.3 日志分级标准（明确定义）**

| 级别 | 用途 | 记录时机 | 示例 |
|---|---|---|---|
| `debug` | 开发调试，生产默认关闭 | 函数入参/出参、内部状态流转 | IPC 调用详情、缓存命中 |
| `info` | 业务操作里程碑 | 用户发起的关键操作成功完成 | 项目创建/打开/保存、章节生成完成、模型切换 |
| `warn` | 可恢复异常、降级 | 重试成功、使用了 fallback、配置缺失但有默认 | 知识库原生模块不可用→降级、配置缺失用默认值 |
| `error` | 不可恢复错误 | 操作失败、异常抛出、IPC 失败 | 模型调用失败、数据库写入失败、组件崩溃 |

**记录时机强制规范**：
- 每个 IPC handler 入口记 `debug`，出口记 `info`（含 `elapsedMs`），异常记 `error`
- 每个业务命令（`base-command` 子类）开始记 `info`，结束记 `info`（含耗时/attempt 数），失败记 `error`（含错误码）
- 每个 store 异步 action 的失败路径记 `error`
- 所有 `throw` 点记 `error`

**8.4 补齐覆盖率（解决 P1）**

按收益优先级分批接入：

| 批次 | 范围 | 模块数 |
|---|---|---|
| 批次 1 | `electron/controllers/` 全部 17 个 | 17 |
| 批次 2 | `electron/llm/` 6 个 + `electron/mcp/` 2 个 | 8 |
| 批次 3 | `src/services/workflows/` 13 个命令 + `src/stores/` 12 个 store | 25 |
| 批次 4 | `electron/repositories/` 21 个（仅 error/warn，避免刷屏） | 21 |

> 采用**集中式装饰器**降低侵入：IPC handler 已有全局追踪（8.5 强化），命令层在 `base-command.ts` 基类统一埋点，store 层提供 `withLogging` 高阶函数。

**8.5 性能监控（解决 L-6）**

新增 `src/services/perf-monitor.ts` + `electron/services/perf-monitor.ts`：
- `perf.mark(name)` / `perf.measure(name, start, end)` 封装 `performance.now()`
- 自动记录：IPC 调用耗时（已有，强化 P50/P95 统计）、LLM 请求首字节/总耗时、章节生成耗时、数据库查询耗时、渲染关键路径
- **慢操作告警**：超过阈值（IPC 1000ms / LLM 首字节 5000ms / DB 查询 200ms）自动记 `warn`
- 定期（每 5 分钟）输出性能摘要到日志

**8.6 日志 UI 与打通（解决 L-8 / L-12）**

- `workflow-store` 的 `globalLogs` 与 `runtimeLog` **双向打通**：`runtimeLog` 的 warn/error 同步进 UI 日志面板；UI 日志的 error 同步落盘
- 底栏「日志」Tab 增强：级别筛选（debug/info/warn/error）、来源筛选、关键字搜索、清空
- 新增「导出日志」按钮：导出当前会话日志为 `.log` 文件
- 新增「打开日志目录」入口

**8.7 脱敏统一（解决 L-9）**

统一 `runtime-logger.redactSensitive()` 与 `safe-call-diagnostic.ts` 的脱敏策略：
- 键白名单统一为单一常量表
- 新增路径脱敏：用户主目录 → `~`，项目路径 → `<project>`，复用 `PATH_SHAPED_TEXT` 正则

**8.8 清理死代码（解决 L-10）**

删除 `src/shared/event-bus.ts` 的 `AppLogger`（0 调用），其 `console.error` 改为 `runtimeLog.error`。

**8.9 运行时级别控制面（解决 L-11）**

- 新增 IPC 通道 `runtime:set-level` / `runtime:get-level`
- 设置面板「高级」区新增日志级别下拉（调试模式可见）
- 环境变量 `AI_NOVEL_LOG_LEVEL` 仍作为启动默认值

### 实现方式
- 重写 `src/services/runtime-log.ts`（有界队列 + 批量 flush）
- 扩展 `electron/services/runtime-logger.ts`（结构化字段、去重限流、性能统计）
- 新增 `perf-monitor.ts`（双进程）
- 新增 `src/components/panels/LogsView` 增强
- 分批给 71 个模块接入日志

### 预期收益
- 修复 5 个失效问题，渲染进程日志从 **0 行** → 可观测
- 日志覆盖率：主进程 4% → ~85%，渲染进程 3% → ~60%
- 新增性能监控（当前为 0 埋点）
- 用户可在应用内查看/筛选/导出日志

---

# 第四部分 · 统一规范清单

## 4.1 颜色规范

| 规则 | 说明 |
|---|---|
| ✅ 用 | `var(--color-*)` 语义变量 / `bg-background` 等 Tailwind 语义类 |
| ❌ 禁 | 原始 Tailwind 语义色族（`bg-red-500`、`text-green-400`） |
| ❌ 禁 | 硬编码 hex（CodeMirror/Monaco 主题与 SVG 图谱除外，需注释说明） |
| ✅ 语义提示条 | 统一用 `.alert-success` / `.alert-warning` / `.alert-error` / `.alert-info` |

## 4.2 尺寸规范

| 类别 | 允许值 |
|---|---|
| 半径 | `sm 4px` · `md 6px` · `lg 8px` · `xl 12px` · `2xl 16px` · `full` |
| 字号 | `2xs 10` · `xs 11` · `sm 12` · `base 13` · `md 14` · `lg 16` · `xl 20` |
| 图标 | `xs 12` · `sm 14` · `md 16` · `lg 20` · `xl 24` |
| 控件高 | `sm 24px` · `default 28px` · `lg 32px` |
| 间距 | Tailwind 标准 4px 栅格 |

## 4.3 动效规范

| 规则 | 说明 |
|---|---|
| 时长 | 只用 `--dur-instant/fast/base/slow/slower`（80/120/200/320/500ms） |
| 缓动 | 只用 `--ease-standard/emphasized/exit/spring` |
| 动画属性 | 只动 `transform` / `opacity` / `filter` |
| 类族 | 只用 `.anim-*`（禁止 `animate-*`，避免与 Tailwind 冲突） |
| 无障碍 | 全局 `prefers-reduced-motion` 兜底；新动画必须被其覆盖 |
| 悬停 | 用 Tailwind `hover:` 变体或 `.hover-*` 类，**禁止 `onMouseEnter` 改 DOM** |

## 4.4 层级规范

```
--z-base 0 · --z-sticky 10 · --z-panel 20 · --z-overlay 100
--z-modal 200 · --z-popover 300 · --z-toast 400 · --z-tooltip 500
```

## 4.5 反馈规范

| 场景 | 必须 |
|---|---|
| 成功操作 | Toast（`role="status"`，`aria-live="polite"`，3.5s） |
| 失败操作 | Toast（`role="alert"`，`aria-live="assertive"`，5s，可展开详情） |
| 危险操作 | `confirm({ danger: true })` Promise 确认 |
| 表单校验 | `onBlur` 首验 → `onChange` 重验；错误 `role="alert"` |
| 加载 >400ms | 骨架屏或 Button `loading` + `aria-busy` |
| 空数据 | `EmptyState`（含 title/description/action） |
| 组件崩溃 | `ErrorBoundary`（含重试 / 复制诊断 / 查看日志） |

## 4.6 日志规范

**格式**：
```
[YYYY-MM-DD HH:mm:ss.SSS] [LEVEL] [process:source] 消息 | {"key":"value","elapsedMs":42,"seq":1234}
```

**必填字段**：`level` · `source` · `message` · `timestamp`
**推荐字段**：`elapsedMs` · `sessionId` · 业务 ID（`projectId` / `chapterId`）
**禁止**：API Key / token / 用户绝对路径（自动脱敏）

---

# 第五部分 · 验收标准与构建流程

## 5.1 逐模块验收清单

| 模块 | 验收标准 |
|---|---|
| **M1** | 4 个主题下全部页面无样式错乱；`--radius-sm` ≠ `--radius-md`；`bg-background` 等语义类可用 |
| **M2** | 表单控件三合一（内距一致、3 个 size 变体、`invalid` 态）；无硬编码 hex（编辑器除外） |
| **M3** | 面板头部 7 处统一；4 个弹窗有焦点陷阱、`role="dialog"`、ESC 可关 |
| **M4** | Toast 有进出场动画；Confirm 无 400ms 延迟；编辑器 Tab 切换有转场 |
| **M5** | 手写 `onMouseEnter` 归零（集中在 10 个文件）；`Skeleton` 有实际使用；Button 支持 `loading` |
| **M6** | 只有 1 个通知容器；全部通知有 `role` + `aria-live`；悬停暂停生效 |
| **M7** | 校验消息 100% `role="alert"`；`EmptyState` 内嵌按钮不透明；ErrorBoundary 全覆盖且语言切换生效 |
| **M8** | 渲染进程日志落盘 > 0 行；EPIPE 警告不再刷屏；应用内可筛选/导出日志；性能埋点 > 0 |

## 5.2 构建与安装流程

```bash
# 1. 类型检查
pnpm run typecheck

# 2. 单元测试（259 个文件）
pnpm test

# 3. 构建 Windows 目录产物
pnpm run build:win-dir
#   → clean:build → typecheck → rebuild:electron → vite build
#   → electron-builder --win dir --x64
#   → verify:win-package（校验 asar / .node 绑定 / 安全脚本）
#   产物：release/0.9.2/win-unpacked/

# 4. 覆盖安装
#    关闭正在运行的 InkWeaver.exe
#    release/0.9.2/win-unpacked/* → D:\Game APP\ai-novel\ai-novel-writer\

# 5. 冒烟验证
pnpm run smoke:win-app
```

### 覆盖安装注意事项

- 目标目录 `D:\Game APP\ai-novel\ai-novel-writer` 的结构与 `win-unpacked/` 完全一致（`InkWeaver.exe` / `resources/` / `locales/` / `*.dll` / `Uninstall InkWeaver.exe`）
- **必须先关闭正在运行的 `InkWeaver.exe`**，否则 `InkWeaver.exe` 与 `resources/` 会被占用导致覆盖失败
- `logs/` 目录为运行时生成，**覆盖时跳过**（保留历史日志）
- 覆盖后确认：`InkWeaver.exe` 时间戳更新、`resources/app.asar` 更新、版本为 0.9.2

## 5.3 风险与回退

| 风险 | 缓解 |
|---|---|
| 覆盖安装时进程占用 | 先 `taskkill /F /IM InkWeaver.exe`，失败则提示用户手动关闭 |
| 内联样式迁移引入视觉回归 | M2.3 只迁移动态无关的三类；逐模块构建验证 |
| 日志接入引入性能开销 | 有界队列 + 批量 flush + 异步写；`debug` 级生产默认关闭 |
| 既有测试破坏 | 每模块完成后立即 `pnpm test`；特别关注 `ipc-handlers-skin.test.ts` / `main-skin-startup.test.ts` |

---

**文档结束 — 请确认后开始逐模块实施。**
