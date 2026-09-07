import { useRef, useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Maximize2, RotateCcw, Tag, ZoomIn, ZoomOut } from 'lucide-react'
import {
  parseRelationshipEdges,
  classifyRelation,
  relationShortLabel,
  RELATION_KIND_PRIORITY,
  type RelationKind,
} from '../../shared/relationship-presentation'
import { useLocaleStore } from '../../stores/locale-store'
import { layoutRelationshipLabels } from './relationship-label-layout'
import {
  filterRelationshipGraph,
  relationshipListRows,
} from './relationship-graph-model'

interface CharacterNode {
  name: string
  role: string
  x: number
  y: number
  vx: number
  vy: number
  pinned?: boolean
}

interface GraphEdge {
  a: string
  b: string
  kind: RelationKind
  items: Array<{
    label: string
    kind: RelationKind
    from: string
    to: string
    direction?: 'outgoing' | 'incoming' | 'mutual'
    sourceChapter?: number
    evidence?: string
  }>
}

interface ResolvedEdge {
  a: CharacterNode
  b: CharacterNode
  label: string
  kind: RelationKind
  ideal: number
  directedItems: GraphEdge['items']
}

interface RelationshipGraphProps {
  characters: Array<{
    name: string
    role: string
    relationships: string
    aliases?: readonly string[]
  }>
  projectKey?: string
}

/** 关系类型 → 连线线型（canvas setLineDash）与图例样式 */
const RELATION_META: Record<RelationKind, { dash: number[]; borderStyle: string; zh: string; en: string }> = {
  hostile: { dash: [7, 4], borderStyle: 'dashed', zh: '敌对', en: 'Hostile' },
  romance: { dash: [2, 4], borderStyle: 'dotted', zh: '恋情', en: 'Romance' },
  mentor: { dash: [5, 3], borderStyle: 'dashed', zh: '师徒', en: 'Mentor' },
  family: { dash: [], borderStyle: 'solid', zh: '亲情', en: 'Family' },
  ally: { dash: [], borderStyle: 'solid', zh: '友好', en: 'Ally' },
  neutral: { dash: [], borderStyle: 'solid', zh: '相识', en: 'Acquaintance' },
}

const withAlpha = (color: string, alpha: string) => (color.startsWith('#') ? color + alpha : color)

// 小图谱默认直接标出每条关系；大图谱只在悬停/固定节点时标（几百个标签会互相糊死）
const EDGE_LABEL_AUTO_LIMIT = 40
const EDGE_LABEL_HOVER_LIMIT = 12
const TOOLTIP_ITEMS_LIMIT = 5

/**
 * 关系图谱的绘制坐标约定（务必遵守，否则坐标错配会把布局搞坏）：
 *   - 节点位置 (x, y) 的单位是"内容像素"，内容空间是 canvas CSS 尺寸的 2 倍：
 *     canvas.width = w * 2（w = offsetWidth CSS 像素），内容中心 = (w, h)。
 *   - drawFrame 里通过
 *       translate(offsetX, offsetY) → translate(w, h) → scale(s) → translate(-w, -h)
 *     把内容点画到 canvas 上，展开后：
 *       device(p) = s * p + (w, h) * (1 - s) + offset      （canvas/backing 像素）
 *       screen(p) = device / 2                              （CSS 像素）
 *   - 反解（屏幕 CSS 像素 → 内容坐标）：
 *       p = (2 * screen - (w, h) * (1 - s) - offset) / s
 *   - offsetX/offsetY 单位 = 内容像素。CSS 上的内容半宽 = box * s / 2，
 *     所以"适配视图"的目标缩放是 1.8 * w / boxW（0.9 填充率 × 2 倍空间）。
 */

export default function RelationshipGraph({ characters, projectKey }: RelationshipGraphProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<CharacterNode[]>([])
  const resolvedEdgesRef = useRef<ResolvedEdge[]>([])
  const animRef = useRef<number>(0)
  const drawRef = useRef<(() => void) | null>(null)
  const viewRef = useRef({ scale: 1, offsetX: 0, offsetY: 0 })
  const dragRef = useRef<{ x: number; y: number } | null>(null)
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)
  const hoverRef = useRef<{ name: string; neighbors: Set<string> } | null>(null)
  const pinnedRef = useRef<{ name: string; neighbors: Set<string> } | null>(null)
  const pinnedNamesRef = useRef<Set<string>>(new Set())
  const edgeHoverRef = useRef<number | null>(null)
  const userInteractedRef = useRef(false)
  const fitViewRef = useRef<(() => void) | null>(null)
  const showEdgeLabelsRef = useRef<boolean | null>(null)
  const [zoomPercent, setZoomPercent] = useState(100)
  const [edgeLabelsOn, setEdgeLabelsOn] = useState<boolean | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [relationFilter, setRelationFilter] = useState<RelationKind | 'all'>('all')
  const [focusDepth, setFocusDepth] = useState<0 | 1 | 2>(1)
  const [layoutEpoch, setLayoutEpoch] = useState(0)
  const [pinVersion, setPinVersion] = useState(0)
  const [tooltip, setTooltip] = useState<{
    x: number
    y: number
    name: string
    role: string
    degree: number
    items: Array<{ other: string; label: string; kind: RelationKind; from: string; direction?: GraphEdge['items'][number]['direction']; sourceChapter?: number; evidence?: string }>
    more: number
  } | null>(null)
  const text = useLocaleStore(state => state.text)

  // 解析关系文本，并把同一对角色的多条描述合并成一条边（线只画一条，类型取最高优先级）
  const graphEdges = useMemo<GraphEdge[]>(() => {
    const knownNames = characters.map((character) => character.name)
    const map = new Map<string, GraphEdge>()
    for (const character of characters) {
      for (const parsed of parseRelationshipEdges(character.relationships, {
        knownNames,
        selfName: character.name,
      })) {
        const [a, b] = character.name < parsed.target
          ? [character.name, parsed.target]
          : [parsed.target, character.name]
        const key = `${a}\u0000${b}`
        let entry = map.get(key)
        if (!entry) {
          entry = { a, b, kind: 'neutral', items: [] }
          map.set(key, entry)
        }
        const label = relationShortLabel(parsed.relation)
        if (!label || entry.items.some((item) => (
          item.label === label
          && item.sourceChapter === parsed.sourceChapter
          && item.evidence === parsed.evidence
          && item.direction === parsed.direction
        ))) continue
        entry.items.push({
          label,
          kind: classifyRelation(parsed.relation),
          from: character.name,
          to: parsed.target,
          ...(parsed.direction === undefined ? {} : { direction: parsed.direction }),
          ...(parsed.sourceChapter === undefined ? {} : { sourceChapter: parsed.sourceChapter }),
          ...(parsed.evidence === undefined ? {} : { evidence: parsed.evidence }),
        })
      }
    }
    const list = [...map.values()]
    for (const entry of list) {
      entry.kind = entry.items.reduce<RelationKind>((best, item) => (
        RELATION_KIND_PRIORITY.indexOf(item.kind) < RELATION_KIND_PRIORITY.indexOf(best)
          ? item.kind
          : best
      ), 'neutral')
    }
    return list
  }, [characters])

  const visibleGraph = useMemo(() => filterRelationshipGraph(
    characters,
    graphEdges,
    {
      query: searchQuery,
      relationKind: relationFilter,
      focusDepth: searchQuery.trim() || relationFilter !== 'all' ? focusDepth : 0,
    },
  ), [characters, focusDepth, graphEdges, relationFilter, searchQuery])

  // 用于悬停邻域高亮和提示条的关系数（合并后 = 不同邻居数）
  const degreeByName = useMemo(() => {
    const map = new Map<string, number>()
    for (const edge of visibleGraph.edges) {
      map.set(edge.a, (map.get(edge.a) ?? 0) + 1)
      map.set(edge.b, (map.get(edge.b) ?? 0) + 1)
    }
    return map
  }, [visibleGraph.edges])

  const buildNeighbors = (name: string) => {
    const neighbors = new Set<string>()
    for (const edge of visibleGraph.edges) {
      if (edge.a === name) neighbors.add(edge.b)
      else if (edge.b === name) neighbors.add(edge.a)
    }
    return neighbors
  }

  // 提示条的关系明细：每条原始描述一行（对象 + 短标签 + 类型）
  const relationsOf = (name: string) => {
    const items: Array<{ other: string; label: string; kind: RelationKind; from: string; direction?: GraphEdge['items'][number]['direction']; sourceChapter?: number; evidence?: string }> = []
    for (const edge of visibleGraph.edges) {
      const other = edge.a === name ? edge.b : edge.b === name ? edge.a : null
      if (!other) continue
      for (const item of edge.items) {
        if (item.label) items.push({
          other,
          label: item.label,
          kind: item.kind,
          from: item.from,
          ...(item.direction === undefined ? {} : { direction: item.direction }),
          ...(item.sourceChapter === undefined ? {} : { sourceChapter: item.sourceChapter }),
          ...(item.evidence === undefined ? {} : { evidence: item.evidence }),
        })
      }
    }
    return items
  }

  const legendKinds = useMemo(
    () => RELATION_KIND_PRIORITY.filter((kind) => visibleGraph.edges.some((edge) => edge.kind === kind)),
    [visibleGraph.edges],
  )

  const effectiveEdgeLabels = edgeLabelsOn ?? visibleGraph.edges.length <= EDGE_LABEL_AUTO_LIMIT
  const accessibleRows = useMemo(
    () => relationshipListRows(visibleGraph.characters, visibleGraph.edges),
    [pinVersion, visibleGraph.characters, visibleGraph.edges],
  )
  const layoutStorageKey = projectKey ? `inkweaver.relationship-layout:${projectKey}` : null

  const readStoredLayout = (): { positions: Record<string, { x: number; y: number }>; pinned: string[] } => {
    if (!layoutStorageKey) return { positions: {}, pinned: [] }
    try {
      const value = JSON.parse(localStorage.getItem(layoutStorageKey) ?? '{}') as { positions?: Record<string, { x?: unknown; y?: unknown }>; pinned?: unknown }
      const positions: Record<string, { x: number; y: number }> = {}
      for (const [name, point] of Object.entries(value.positions ?? {})) {
        if (typeof point.x === 'number' && Number.isFinite(point.x) && typeof point.y === 'number' && Number.isFinite(point.y)) positions[name] = { x: point.x, y: point.y }
      }
      const pinned = Array.isArray(value.pinned) ? value.pinned.filter((name): name is string => typeof name === 'string') : []
      return { positions, pinned }
    } catch { return { positions: {}, pinned: [] } }
  }

  const persistLayout = (nodes: readonly CharacterNode[]) => {
    if (!layoutStorageKey || nodes.length === 0) return
    try {
      localStorage.setItem(layoutStorageKey, JSON.stringify({
        positions: Object.fromEntries(nodes.map(node => [node.name, { x: node.x, y: node.y }])),
        pinned: [...pinnedNamesRef.current],
      }))
    } catch { /* presentation state is best-effort */ }
  }

  const resetLayout = () => {
    if (layoutStorageKey) localStorage.removeItem(layoutStorageKey)
    pinnedNamesRef.current = new Set()
    setLayoutEpoch(value => value + 1)
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const themeObserver = new MutationObserver(() => drawRef.current?.())
    let resizeObserver: ResizeObserver | null = null
    let lastWidth = 0
    let lastHeight = 0
    let layoutKey: unknown = null

    let sizeRetry = 0
    const tryInitialize = () => {
      const w = canvas.offsetWidth
      const h = canvas.offsetHeight
      if ((w <= 0 || h <= 0) && sizeRetry < 4) {
        sizeRetry += 1
        requestAnimationFrame(tryInitialize)
        return
      }
      if (w <= 0 || h <= 0) return
      initialize(w, h)
    }

    const initialize = (w: number, h: number) => {
      // 尺寸与角色数据都没变时才跳过；否则角色编辑后图谱会停留在旧数据
      if (w === lastWidth && h === lastHeight && layoutKey === visibleGraph.characters && drawRef.current) return
      lastWidth = w
      lastHeight = h
      layoutKey = visibleGraph.characters
      userInteractedRef.current = false
      hoverRef.current = null
      pinnedRef.current = null
      edgeHoverRef.current = null
      setTooltip(null)
      cancelAnimationFrame(animRef.current)

      canvas.width = w * 2
      canvas.height = h * 2

      const nodeCount = visibleGraph.characters.length
      const dense = nodeCount > 80
      const centerX = w
      const centerY = h
      const nodeNames = new Map<string, CharacterNode>()
      const storedLayout = readStoredLayout()
      pinnedNamesRef.current = new Set(storedLayout.pinned)

      // 初始布局：黄金角螺旋/圆环铺满整个画布（内容空间 = 2 × CSS，半轴 w/h 即铺满 CSS 全宽高）
      nodesRef.current = visibleGraph.characters.map((c, i) => {
        let x: number
        let y: number
        if (dense) {
          const rx = w * 0.88
          const ry = h * 0.88
          const theta = i * 2.39996323
          const r = Math.sqrt((i + 0.5) / nodeCount)
          x = centerX + rx * r * Math.cos(theta)
          y = centerY + ry * r * Math.sin(theta)
        } else {
          const angle = (i / nodeCount) * Math.PI * 2 - Math.PI / 2
          const radius = Math.min(w, h) * 0.9
          x = centerX + radius * Math.cos(angle)
          y = centerY + radius * Math.sin(angle)
        }
        const stored = storedLayout.positions[c.name]
        const node: CharacterNode = {
          name: c.name,
          role: c.role,
          x: stored?.x ?? x,
          y: stored?.y ?? y,
          vx: 0,
          vy: 0,
          pinned: pinnedNamesRef.current.has(c.name),
        }
        nodeNames.set(c.name, node)
        return node
      })

      // 连线只解析一次；后续每帧直接使用引用，避免 O(E·N) 的 nodes.find
      const degree = new Map<CharacterNode, number>()
      const resolvedEdges: ResolvedEdge[] = visibleGraph.edges
        .map((edge) => ({
          a: nodeNames.get(edge.a),
          b: nodeNames.get(edge.b),
          label: edge.items.slice(0, 3).map((item) => item.label).join(' / ')
            + (edge.items.length > 3 ? '…' : ''),
          kind: edge.kind,
          ideal: 150,
          directedItems: edge.items,
        }))
        .filter(
          (e): e is ResolvedEdge => !!e.a && !!e.b && e.a !== e.b,
        )
      resolvedEdgesRef.current = resolvedEdges
      for (const edge of resolvedEdges) {
        degree.set(edge.a, (degree.get(edge.a) ?? 0) + 1)
        degree.set(edge.b, (degree.get(edge.b) ?? 0) + 1)
      }

      const sortedByDegree = [...nodesRef.current].sort(
        (x, y) => (degree.get(y) ?? 0) - (degree.get(x) ?? 0),
      )

      const repulsion = dense ? 3200 : 8000
      const springIdeal = dense ? 160 : 150
      const springK = dense ? 0.02 : 0.01
      const gravity = dense ? 0.006 : 0.002
      const maxStep = dense ? 20 : 24
      const maxIterations = dense ? 240 : 120
      let iteration = 0
      // 度数越高的边越长，把枢纽的邻居推离中心，避免中心堵成一团
      for (const edge of resolvedEdges) {
        const degSum = (degree.get(edge.a) ?? 0) + (degree.get(edge.b) ?? 0)
        edge.ideal = springIdeal * (1 + Math.min(30, degSum) * 0.012)
      }

      const drawFrame = () => {
        const current = canvasRef.current
        if (!current) return
        const ctx = current.getContext('2d')
        if (!ctx) return
        const canvasStyles = getComputedStyle(current)
        const readableTextColor = canvasStyles.color
        const haloColor = canvasStyles.getPropertyValue('--color-panel').trim()
          || canvasStyles.backgroundColor.trim()
          || '#ffffff'

        const nodes = nodesRef.current
        const view = viewRef.current
        const cw = current.width
        const ch = current.height

        // 角色 → 角色色缓存（每帧一次，避免逐节点查询 CSS 变量）
        const roleColorCache = new Map<string, string>()
        const colorFor = (node: CharacterNode) => {
          const role = ['protagonist', 'antagonist', 'supporting', 'minor'].includes(node.role)
            ? node.role
            : 'minor'
          let color = roleColorCache.get(role)
          if (color === undefined) {
            color = canvasStyles.getPropertyValue(`--color-role-${role}`).trim()
              || canvasStyles.getPropertyValue('--color-text-secondary').trim()
              || '#94a3b8'
            roleColorCache.set(role, color)
          }
          return color
        }

        // 关系类型 → 连线色缓存（同样走主题语义变量）
        const relColorCache = new Map<RelationKind, string>()
        const kindColor = (kind: RelationKind) => {
          let color = relColorCache.get(kind)
          if (color === undefined) {
            color = canvasStyles.getPropertyValue(`--color-rel-${kind}`).trim()
              || canvasStyles.getPropertyValue('--color-text-secondary').trim()
              || '#94a3b8'
            relColorCache.set(kind, color)
          }
          return color
        }

        // 悬停优先，其次点击固定的节点
        const active = hoverRef.current ?? pinnedRef.current
        const hoveredNode = active ? nodes.find((node) => node.name === active.name) : undefined
        const hoveredColor = hoveredNode ? colorFor(hoveredNode) : ''
        const isRelated = (node: CharacterNode) =>
          !active || active.name === node.name || active.neighbors.has(node.name)
        const edgeConnected = (edge: ResolvedEdge) =>
          !!active && (edge.a.name === active.name || edge.b.name === active.name)
        const showAllEdgeLabels = showEdgeLabelsRef.current ?? resolvedEdges.length <= EDGE_LABEL_AUTO_LIMIT

        ctx.clearRect(0, 0, cw, ch)
        ctx.save()
        ctx.translate(view.offsetX, view.offsetY)
        ctx.translate(cw / 2, ch / 2)
        ctx.scale(view.scale, view.scale)
        ctx.translate(-cw / 2, -ch / 2)

        // 边：全部绘制，颜色/线型按关系类型；悬停节点的边加粗提亮
        for (const [index, edge] of resolvedEdges.entries()) {
          const base = kindColor(edge.kind)
          const connected = edgeConnected(edge)
          const directlyHovered = !active && edgeHoverRef.current === index
          if (typeof ctx.setLineDash === 'function') {
            ctx.setLineDash(RELATION_META[edge.kind].dash)
          }
          if (connected) {
            ctx.strokeStyle = withAlpha(base, 'ee')
            ctx.lineWidth = dense ? 2 : 2.6
          } else if (directlyHovered) {
            ctx.strokeStyle = withAlpha(base, 'ff')
            ctx.lineWidth = dense ? 2.2 : 2.8
          } else if (active) {
            ctx.strokeStyle = withAlpha(base, '22')
            ctx.lineWidth = 1
          } else {
            ctx.strokeStyle = withAlpha(base, dense ? '45' : '66')
            ctx.lineWidth = dense ? 1.1 : 1.5
          }
          ctx.beginPath()
          ctx.moveTo(edge.a.x, edge.a.y)
          ctx.lineTo(edge.b.x, edge.b.y)
          ctx.stroke()
          const directed = edge.directedItems.filter(item => item.direction && item.direction !== 'mutual')
          for (const item of directed.slice(0, 3)) {
            const from = item.from === edge.a.name ? edge.a : item.from === edge.b.name ? edge.b : null
            const to = item.to === edge.a.name ? edge.a : item.to === edge.b.name ? edge.b : null
            if (!from || !to) continue
            const dx = to.x - from.x
            const dy = to.y - from.y
            const length = Math.max(Math.hypot(dx, dy), 1)
            const tipX = to.x - (dx / length) * (dense ? 10 : 24)
            const tipY = to.y - (dy / length) * (dense ? 10 : 24)
            const size = dense ? 5 : 8
            const angle = Math.atan2(dy, dx)
            ctx.beginPath()
            ctx.moveTo(tipX, tipY)
            ctx.lineTo(tipX - size * Math.cos(angle - Math.PI / 6), tipY - size * Math.sin(angle - Math.PI / 6))
            ctx.lineTo(tipX - size * Math.cos(angle + Math.PI / 6), tipY - size * Math.sin(angle + Math.PI / 6))
            if (typeof ctx.closePath === 'function') ctx.closePath()
            ctx.fillStyle = withAlpha(base, connected ? 'ee' : '99')
            ctx.fill()
          }
        }
        if (typeof ctx.setLineDash === 'function') ctx.setLineDash([])

        const nodeR = dense ? 9 : 20
        const haloR = dense ? 13 : 28
        // 悬停时先画无关节点（调暗），再画相关节点（高亮在最上层）
        const drawNode = (node: CharacterNode, emphasized: boolean) => {
          const color = colorFor(node)
          const radius = emphasized ? nodeR + 1 : nodeR
          ctx.globalAlpha = emphasized ? 1 : active ? 0.16 : 1
          ctx.beginPath()
          ctx.arc(node.x, node.y, emphasized ? haloR + 2 : haloR, 0, Math.PI * 2)
          ctx.fillStyle = color + '25'
          ctx.fill()
          ctx.beginPath()
          ctx.arc(node.x, node.y, radius, 0, Math.PI * 2)
          ctx.fillStyle = color + (emphasized ? '55' : '40')
          ctx.fill()
          ctx.strokeStyle = color
          ctx.lineWidth = dense ? (emphasized ? 1.6 : 1) : 2
          ctx.stroke()
          ctx.globalAlpha = 1
        }
        if (active) {
          for (const node of nodes) {
            if (!isRelated(node)) drawNode(node, false)
          }
          for (const node of nodes) {
            if (isRelated(node) && node.name !== active.name) drawNode(node, true)
          }
          if (hoveredNode) {
            drawNode(hoveredNode, true)
            ctx.beginPath()
            ctx.arc(hoveredNode.x, hoveredNode.y, nodeR + 6, 0, Math.PI * 2)
            ctx.strokeStyle = hoveredColor.startsWith('#') ? hoveredColor : '#3b82f6'
            ctx.lineWidth = 2
            ctx.stroke()
          }
        } else {
          for (const node of nodes) drawNode(node, false)
        }

        const labelSize = dense ? 12 : 22
        ctx.font = `bold ${labelSize}px system-ui`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const labelDy = dense ? 16 : 36
        // 文字描边（背景色光晕），重叠时依然可读
        ctx.lineJoin = 'round'
        ctx.lineWidth = 3
        ctx.strokeStyle = haloColor

        if (dense) {
          // 大图谱节点标签避让：按度数降序放置，重叠即跳过；悬停时只画相关标签
          const usedBoxes: [number, number, number, number][] = []
          for (const node of sortedByDegree) {
            if (!isRelated(node)) continue
            const textWidth = ctx.measureText(node.name).width * view.scale
            const cx = (node.x - w / 2) * view.scale + view.offsetX + w / 2
            const cy = (node.y + labelDy - h / 2) * view.scale + view.offsetY + h / 2
            const halfW = textWidth / 2 + 3
            const halfH = labelSize * view.scale * 0.6 + 3
            const box: [number, number, number, number] = [cx - halfW, cy - halfH, cx + halfW, cy + halfH]
            if (usedBoxes.some((other) =>
              box[0] < other[2] && other[0] < box[2] && box[1] < other[3] && other[1] < box[3])) {
              continue
            }
            usedBoxes.push(box)
            ctx.strokeText(node.name, node.x, node.y + labelDy)
            ctx.fillStyle = readableTextColor
            ctx.fillText(node.name, node.x, node.y + labelDy)
          }
          ctx.lineWidth = 1
        } else {
          ctx.fillStyle = readableTextColor
          for (const node of nodes) {
            ctx.globalAlpha = isRelated(node) ? 1 : 0.2
            ctx.strokeText(node.name, node.x, node.y + labelDy)
            ctx.fillText(node.name, node.x, node.y + labelDy)
          }
          ctx.globalAlpha = 1
        }

        // 关系标签：颜色随关系类型；小图谱全量标注，大图谱只标当前强调的边
        const edgeLabelSize = dense ? 11 : 18
        ctx.font = `${edgeLabelSize}px system-ui`
        ctx.textBaseline = 'alphabetic'
        ctx.lineJoin = 'round'
        ctx.lineWidth = 2
        ctx.strokeStyle = haloColor

        const showSparseLabels = showAllEdgeLabels && !active
        let labelEntries: ResolvedEdge[] = []
        if (showSparseLabels) {
          labelEntries = resolvedEdges.filter((edge) => edge.label)
        } else {
          for (const [index, edge] of resolvedEdges.entries()) {
            if (!edge.label) continue
            if (edgeConnected(edge) || (!active && edgeHoverRef.current === index)) {
              labelEntries.push(edge)
            }
          }
          // 枢纽可能连着上百条边，标签全画会糊死：优先最短的（空间上最近）几条
          if (labelEntries.length > EDGE_LABEL_HOVER_LIMIT) {
            labelEntries.sort((p, q) => (
              Math.hypot(p.a.x - p.b.x, p.a.y - p.b.y) - Math.hypot(q.a.x - q.b.x, q.a.y - q.b.y)
            ))
            labelEntries = labelEntries.slice(0, EDGE_LABEL_HOVER_LIMIT)
          }
        }
        const pixelRatio = current.width / Math.max(current.clientWidth, 1)
        const labels = labelEntries.map((edge) => {
          const dx = edge.b.x - edge.a.x
          const dy = edge.b.y - edge.a.y
          const length = Math.hypot(dx, dy) || 1
          return {
            edge,
            anchor: {
              x: (edge.a.x + edge.b.x) / 2,
              y: (edge.a.y + edge.b.y) / 2 - 4,
              normalX: -dy / length,
              normalY: dx / length,
              width: ctx.measureText(edge.label).width,
              height: edgeLabelSize,
            },
          }
        })
        const placements = layoutRelationshipLabels(
          labels.map((entry) => entry.anchor),
          {
            maxOffset: 24,
            gap: 4,
            // Canvas coordinates are backing-store pixels. Convert the
            // screen-space bound before comparing label rectangles.
            scale: view.scale / Math.max(pixelRatio, 1),
          },
        )
        for (const [index, entry] of labels.entries()) {
          const placement = placements[index]
          if (!placement || placement.hidden) continue
          if (placement.leader) {
            ctx.save()
            ctx.globalAlpha = 0.45
            ctx.strokeStyle = kindColor(entry.edge.kind)
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.moveTo(entry.anchor.x, entry.anchor.y + 2)
            ctx.lineTo(placement.x, placement.y - entry.anchor.height / 2)
            ctx.stroke()
            ctx.restore()
          }
          ctx.strokeText(entry.edge.label, placement.x, placement.y)
          ctx.fillStyle = kindColor(entry.edge.kind)
          ctx.fillText(entry.edge.label, placement.x, placement.y)
        }
        ctx.restore()
      }
      drawRef.current = drawFrame

      const skinRoot = canvas.closest<HTMLElement>('.app-skin-root')
      const observedThemeRoots = new Set<HTMLElement>([
        document.documentElement,
        ...(skinRoot ? [skinRoot] : []),
      ])
      for (const themeRoot of observedThemeRoots) themeObserver.observe(themeRoot, {
        attributes: true,
        attributeFilter: ['class', 'style', 'data-theme', 'data-skin', 'data-skin-readability'],
      })

      const cw = canvas.width
      const ch = canvas.height

      const simulate = () => {
        const nodes = nodesRef.current
        if (iteration >= maxIterations) {
          drawFrame()
          persistLayout(nodes)
          // 布局收敛后自动适配视图，保证一眼看到全图（用户已手动操作过则不打扰）
          if (!userInteractedRef.current && nodes.length > 1) fitViewRef.current?.()
          return
        }

        // alpha 冷却：所有力随迭代衰减，确保结束时布局静止而非"冻结在半失控瞬间"
        const alpha = Math.pow(1 - iteration / maxIterations, 1.5)

        // 斥力（O(n²)，200 节点约 2 万对，单帧可负担）
        for (let i = 0; i < nodes.length; i++) {
          const ni = nodes[i]
          for (let j = i + 1; j < nodes.length; j++) {
            const nj = nodes[j]
            const dx = nj.x - ni.x
            const dy = nj.y - ni.y
            const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
            const force = (repulsion / (dist * dist)) * alpha
            const fx = (dx / dist) * force
            const fy = (dy / dist) * force
            ni.vx -= fx
            ni.vy -= fy
            nj.vx += fx
            nj.vy += fy
          }
        }

        // 弹簧（理想长度已按度数放宽）
        for (const edge of resolvedEdges) {
          const dx = edge.b.x - edge.a.x
          const dy = edge.b.y - edge.a.y
          const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1)
          const force = (dist - edge.ideal) * springK * alpha
          const fx = (dx / dist) * force
          const fy = (dy / dist) * force
          edge.a.vx += fx
          edge.a.vy += fy
          edge.b.vx -= fx
          edge.b.vy -= fy
        }

        // 向心力
        for (const node of nodes) {
          if (node.pinned) {
            node.vx = 0
            node.vy = 0
            continue
          }
          node.vx += (centerX - node.x) * gravity * alpha
          node.vy += (centerY - node.y) * gravity * alpha
        }

        // 应用速度 + 阻尼 + 单帧位移上限
        const damping = 0.85
        const minX = 40
        const minY = 40
        const maxX = cw - 40
        const maxY = ch - 40
        for (const node of nodes) {
          if (node.pinned) {
            node.vx = 0
            node.vy = 0
            continue
          }
          node.vx *= damping
          node.vy *= damping
          const speed = Math.sqrt(node.vx * node.vx + node.vy * node.vy)
          if (speed > maxStep) {
            node.vx = (node.vx / speed) * maxStep
            node.vy = (node.vy / speed) * maxStep
          }
          node.x += node.vx
          node.y += node.vy
          if (node.x < minX) { node.x = minX; node.vx = 0 }
          else if (node.x > maxX) { node.x = maxX; node.vx = 0 }
          if (node.y < minY) { node.y = minY; node.vy = 0 }
          else if (node.y > maxY) { node.y = maxY; node.vy = 0 }
        }

        iteration++
        drawFrame()
        animRef.current = requestAnimationFrame(simulate)
      }

      simulate()
    }

    tryInitialize()

    resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0]
      const nextW = Math.round(entry.contentRect.width)
      const nextH = Math.round(entry.contentRect.height)
      if (nextW <= 0 || nextH <= 0) return
      // 测试环境无 Tailwind，canvas 布局尺寸跟随 width 属性：initialize 把
      // canvas.width 翻倍会再次触发本回调导致无限循环。观察到的大小若等于
      // 当前 backing store 尺寸，说明是属性驱动的变化而非面板真实缩放，跳过。
      if (nextW === canvas.width && nextH === canvas.height) return
      initialize(nextW, nextH)
    })
    resizeObserver.observe(canvas)

    return () => {
      themeObserver.disconnect()
      resizeObserver?.disconnect()
      cancelAnimationFrame(animRef.current)
      drawRef.current = null
    }
  }, [layoutEpoch, visibleGraph.characters, visibleGraph.edges])

  // 屏幕 CSS 坐标 → 内容坐标（见文件头注释的反解公式）
  const screenToContent = (screenX: number, screenY: number, w: number, h: number) => {
    const { scale, offsetX, offsetY } = viewRef.current
    return {
      x: (2 * screenX - w * (1 - scale) - offsetX) / scale,
      y: (2 * screenY - h * (1 - scale) - offsetY) / scale,
    }
  }

  // 内容坐标 → 屏幕 CSS 坐标（用于摆放悬停提示条）
  const contentToScreen = (contentX: number, contentY: number, w: number, h: number) => {
    const { scale, offsetX, offsetY } = viewRef.current
    return {
      x: (scale * contentX + w * (1 - scale) + offsetX) / 2,
      y: (scale * contentY + h * (1 - scale) + offsetY) / 2,
    }
  }

  const updateCursor = (hovering: boolean, dragging: boolean) => {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.style.cursor = dragging ? 'grabbing' : hovering ? 'pointer' : 'grab'
  }

  // 注意：内容空间 = canvas.width（backing store），其 CSS 尺寸恒为 canvas.width / 2。
  // 不要用 offsetWidth —— 测试环境（无 Tailwind）里 canvas 布局跟随 width 属性，
  // initialize 设置 width 后 offsetWidth 会变成 2 倍，导致视图计算全部错位。
  const cssWidth = () => {
    const canvas = canvasRef.current
    return canvas ? canvas.width / 2 : 0
  }
  const cssHeight = () => {
    const canvas = canvasRef.current
    return canvas ? canvas.height / 2 : 0
  }

  const updateZoom = (nextScale: number, anchorX?: number, anchorY?: number) => {
    const canvas = canvasRef.current
    const view = viewRef.current
    const scale = Math.min(2, Math.max(0.5, nextScale))
    userInteractedRef.current = true
    if (canvas && anchorX !== undefined && anchorY !== undefined) {
      const w = cssWidth()
      const h = cssHeight()
      // 反解 anchor 对应的内容点，应用新缩放后保持它在屏幕上不动
      const content = screenToContent(anchorX, anchorY, w, h)
      view.offsetX = 2 * anchorX - scale * content.x - w * (1 - scale)
      view.offsetY = 2 * anchorY - scale * content.y - h * (1 - scale)
    }
    view.scale = scale
    setZoomPercent(Math.round(scale * 100))
    drawRef.current?.()
  }

  const fitView = () => {
    const canvas = canvasRef.current
    const nodes = nodesRef.current
    const w = canvas ? canvas.width / 2 : 0
    const h = canvas ? canvas.height / 2 : 0
    if (!canvas || w === 0 || h === 0 || nodes.length === 0) {
      viewRef.current = { scale: 1, offsetX: 0, offsetY: 0 }
      setZoomPercent(100)
      drawRef.current?.()
      return
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const node of nodes) {
      if (node.x < minX) minX = node.x
      if (node.x > maxX) maxX = node.x
      if (node.y < minY) minY = node.y
      if (node.y > maxY) maxY = node.y
    }
    const pad = 60
    const boxW = Math.max(maxX - minX + pad * 2, 1)
    const boxH = Math.max(maxY - minY + pad * 2, 1)
    // 内容空间是 CSS 的 2 倍：CSS 上的内容宽度 = boxW * scale / 2
    const scale = Math.min(2, Math.max(0.5, Math.min((w * 1.8) / boxW, (h * 1.8) / boxH)))
    const snapped = Math.round(scale * 100) / 100
    const cx = (minX + maxX) / 2
    const cy = (minY + maxY) / 2
    viewRef.current = {
      scale: snapped,
      offsetX: snapped * (w - cx),
      offsetY: snapped * (h - cy),
    }
    setZoomPercent(Math.round(snapped * 100))
    drawRef.current?.()
  }

  useEffect(() => {
    fitViewRef.current = fitView
  })

  if (characters.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-[var(--color-text-muted)]">
        暂无角色数据
      </div>
    )
  }

  // 命中检测：返回节点（供悬停与点击固定共用）
  const hitNode = (contentX: number, contentY: number) => {
    let best: CharacterNode | null = null
    let bestDist = Infinity
    for (const node of nodesRef.current) {
      const dx = node.x - contentX
      const dy = node.y - contentY
      const dist = dx * dx + dy * dy
      if (dist < bestDist) {
        bestDist = dist
        best = node
      }
    }
    return best && bestDist <= 26 * 26 ? best : null
  }

  // 命中检测：最近的关系线（阈值 ≈ 10 CSS 像素）
  const hitEdge = (contentX: number, contentY: number) => {
    const { scale } = viewRef.current
    const threshold = 20 / Math.max(scale, 0.1)
    const threshold2 = threshold * threshold
    let bestIndex: number | null = null
    let bestDist = Infinity
    for (const [index, edge] of resolvedEdgesRef.current.entries()) {
      const ax = edge.a.x
      const ay = edge.a.y
      const dx = edge.b.x - ax
      const dy = edge.b.y - ay
      const length2 = dx * dx + dy * dy || 1
      let t = ((contentX - ax) * dx + (contentY - ay) * dy) / length2
      t = Math.max(0, Math.min(1, t))
      const ex = contentX - (ax + t * dx)
      const ey = contentY - (ay + t * dy)
      const dist = ex * ex + ey * ey
      if (dist < bestDist) {
        bestDist = dist
        bestIndex = index
      }
    }
    return bestDist <= threshold2 ? bestIndex : null
  }

  const showTooltipFor = (node: CharacterNode, w: number, h: number) => {
    const items = relationsOf(node.name)
    const screen = contentToScreen(node.x, node.y, w, h)
    setTooltip({
      x: Math.min(Math.max(screen.x, 90), w - 90),
      y: screen.y,
      name: node.name,
      role: node.role,
      degree: degreeByName.get(node.name) ?? items.length,
      items: items.slice(0, TOOLTIP_ITEMS_LIMIT),
      more: Math.max(0, items.length - TOOLTIP_ITEMS_LIMIT),
    })
  }

  const focusFromAccessibleList = (name: string) => {
    const node = nodesRef.current.find(candidate => candidate.name === name)
    if (!node) return
    const neighbors = buildNeighbors(name)
    pinnedRef.current = { name, neighbors }
    hoverRef.current = null
    const w = cssWidth()
    const h = cssHeight()
    showTooltipFor(node, w, h)
    drawRef.current?.()
  }

  const togglePinnedFromAccessibleList = (name: string) => {
    const next = new Set(pinnedNamesRef.current)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    pinnedNamesRef.current = next
    const node = nodesRef.current.find(candidate => candidate.name === name)
    if (node) node.pinned = next.has(name)
    persistLayout(nodesRef.current)
    setPinVersion(value => value + 1)
    drawRef.current?.()
  }

  const restorePinnedTooltip = (w: number, h: number) => {
    const pinned = pinnedRef.current
    if (!pinned) return
    const node = nodesRef.current.find((candidate) => candidate.name === pinned.name)
    if (node) showTooltipFor(node, w, h)
  }

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget
    const rect = canvas.getBoundingClientRect()
    const screenX = event.clientX - rect.left
    const screenY = event.clientY - rect.top

    if (dragRef.current) {
      const pixelRatio = canvas.width / Math.max(canvas.clientWidth, 1)
      viewRef.current.offsetX += (event.clientX - dragRef.current.x) * pixelRatio
      viewRef.current.offsetY += (event.clientY - dragRef.current.y) * pixelRatio
      dragRef.current = { x: event.clientX, y: event.clientY }
      drawRef.current?.()
      return
    }

    const w = canvas.width / 2
    const h = canvas.height / 2
    const content = screenToContent(screenX, screenY, w, h)

    const next = hitNode(content.x, content.y)
    if (next) {
      edgeHoverRef.current = null
      const currentHover = hoverRef.current
      if (!currentHover || currentHover.name !== next.name) {
        hoverRef.current = { name: next.name, neighbors: buildNeighbors(next.name) }
        showTooltipFor(next, w, h)
        updateCursor(true, false)
        drawRef.current?.()
      }
      return
    }

    if (hoverRef.current) {
      hoverRef.current = null
      // 离开节点后若有点击固定的节点，恢复它的提示条
      if (pinnedRef.current) restorePinnedTooltip(w, h)
      else setTooltip(null)
      updateCursor(false, false)
      drawRef.current?.()
    }

    // 未命中节点时尝试命中单条关系线，直接高亮它
    const edgeIndex = hitEdge(content.x, content.y)
    if (edgeHoverRef.current !== edgeIndex) {
      edgeHoverRef.current = edgeIndex
      updateCursor(edgeIndex !== null, false)
      drawRef.current?.()
    }
  }

  const endHover = () => {
    if (hoverRef.current) {
      hoverRef.current = null
      drawRef.current?.()
    }
    if (pinnedRef.current) {
      const w = cssWidth()
      const h = cssHeight()
      restorePinnedTooltip(w, h)
    } else {
      setTooltip(null)
    }
    updateCursor(false, false)
  }

  return (
    <div className="relative h-full overflow-hidden">
      <div
        className="absolute left-3 top-3 z-10 flex items-center gap-1 rounded-md border px-1 py-1"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-panel)',
          color: 'var(--color-text)',
        }}
      >
        <input
          value={searchQuery}
          onChange={event => setSearchQuery(event.target.value)}
          className="w-28 rounded border bg-transparent px-1.5 py-1 text-[11px] outline-none"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          placeholder={text('搜索角色', 'Search')}
          aria-label={text('搜索角色', 'Search characters')}
        />
        <select
          value={relationFilter}
          onChange={event => setRelationFilter(event.target.value as RelationKind | 'all')}
          className="max-w-20 rounded border bg-transparent px-1 py-1 text-[11px] outline-none"
          style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
          aria-label={text('按关系类型筛选', 'Filter by relationship type')}
        >
          <option value="all">{text('全部', 'All')}</option>
          {RELATION_KIND_PRIORITY.map(kind => (
            <option key={kind} value={kind}>{text(RELATION_META[kind].zh, RELATION_META[kind].en)}</option>
          ))}
        </select>
        {(searchQuery.trim() || relationFilter !== 'all') && (
          <select
            value={focusDepth}
            onChange={event => setFocusDepth(Number(event.target.value) as 0 | 1 | 2)}
            className="max-w-20 rounded border bg-transparent px-1 py-1 text-[11px] outline-none"
            style={{ borderColor: 'var(--color-border)', color: 'var(--color-text)' }}
            aria-label={text('聚焦范围', 'Focus depth')}
          >
            <option value={0}>{text('仅匹配', 'Matches')}</option>
            <option value={1}>{text('一跳邻居', 'One hop')}</option>
            <option value={2}>{text('二跳邻居', 'Two hops')}</option>
          </select>
        )}
        {(searchQuery || relationFilter !== 'all') && (
          <span className="px-1 text-[10px] tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
            {visibleGraph.characters.length}
          </span>
        )}
      </div>
      <div
        className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-md border px-1 py-1"
        style={{
          borderColor: 'var(--color-border)',
          backgroundColor: 'var(--color-panel)',
          color: 'var(--color-text)',
        }}
      >
        <button
          type="button"
          className="rounded p-1 hover:bg-[var(--color-hover)]"
          aria-label={text('缩小关系图谱', 'Zoom out of character graph')}
          onClick={() => updateZoom(viewRef.current.scale - 0.1)}
        >
          <ZoomOut size={14} aria-hidden="true" />
        </button>
        <span className="min-w-10 text-center text-[11px] tabular-nums">{zoomPercent}%</span>
        <button
          type="button"
          className="rounded p-1 hover:bg-[var(--color-hover)]"
          aria-label={text('放大关系图谱', 'Zoom in to character graph')}
          onClick={() => updateZoom(viewRef.current.scale + 0.1)}
        >
          <ZoomIn size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rounded p-1 hover:bg-[var(--color-hover)]"
          aria-label={text('适合视图', 'Fit character graph to view')}
          onClick={fitView}
        >
          <Maximize2 size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rounded p-1 hover:bg-[var(--color-hover)]"
          style={effectiveEdgeLabels ? { backgroundColor: 'var(--color-active)' } : undefined}
          aria-label={text('切换关系标签', 'Toggle relationship labels')}
          aria-pressed={effectiveEdgeLabels}
          onClick={() => {
            const next = !effectiveEdgeLabels
            showEdgeLabelsRef.current = next
            setEdgeLabelsOn(next)
            drawRef.current?.()
          }}
        >
          <Tag size={14} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="rounded p-1 hover:bg-[var(--color-hover)]"
          aria-label={text('重置关系图布局', 'Reset relationship graph layout')}
          onClick={resetLayout}
        >
          <RotateCcw size={14} aria-hidden="true" />
        </button>
      </div>
      {legendKinds.length > 0 && (
        <div
          data-relationship-legend="true"
          className="pointer-events-none absolute bottom-3 left-3 z-10 flex max-w-[calc(100%-24px)] flex-wrap items-center gap-x-3 gap-y-1 rounded-md border px-2 py-1.5 text-[11px]"
          style={{
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-panel)',
            color: 'var(--color-text)',
          }}
        >
          {legendKinds.map((kind) => (
            <span key={kind} className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                aria-hidden="true"
                className="inline-block w-5"
                style={{ borderTop: `2px ${RELATION_META[kind].borderStyle} var(--color-rel-${kind})` }}
              />
              <span>{text(RELATION_META[kind].zh, RELATION_META[kind].en)}</span>
            </span>
          ))}
        </div>
      )}
      {accessibleRows.length > 0 && (
        <details
          data-relationship-list="true"
          className="absolute bottom-3 right-3 z-10 max-w-[min(14rem,calc(100%-24px))] rounded-md border text-[11px]"
          style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-panel)', color: 'var(--color-text)' }}
        >
          <summary className="cursor-pointer select-none px-2 py-1.5">
            {text('角色列表', 'Character list')} · {accessibleRows.length}
          </summary>
          <div className="max-h-48 overflow-y-auto border-t p-1" style={{ borderColor: 'var(--color-border)' }} role="list">
            {accessibleRows.slice(0, 120).map(row => (
              <button
                key={row.name}
                type="button"
                role="listitem"
                className="flex w-full items-center justify-between gap-2 rounded px-1.5 py-1 text-left hover:bg-[var(--color-hover)]"
                onClick={() => focusFromAccessibleList(row.name)}
                onDoubleClick={() => togglePinnedFromAccessibleList(row.name)}
                title={text('单击聚焦，双击固定/取消固定节点', 'Click to focus; double-click to pin or unpin')}
              >
                <span className="truncate">{pinnedNamesRef.current.has(row.name) ? '📌 ' : ''}{row.name}</span>
                <span className="shrink-0 tabular-nums text-[var(--color-text-muted)]">{row.degree}</span>
              </button>
            ))}
          </div>
        </details>
      )}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-20 rounded-md border px-2 py-1.5 text-[11px] shadow-sm"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, calc(-100% - 14px))',
            borderColor: 'var(--color-border)',
            backgroundColor: 'var(--color-panel)',
            color: 'var(--color-text)',
          }}
        >
          <div className="whitespace-nowrap">
            <span className="font-semibold">{tooltip.name}</span>
            <span className="mx-1 text-[var(--color-text-muted)]">·</span>
            <span className="text-[var(--color-text-secondary)]">{tooltip.role}</span>
            <span className="mx-1 text-[var(--color-text-muted)]">·</span>
            <span className="text-[var(--color-text-secondary)]">{tooltip.degree} 条关系</span>
          </div>
          {tooltip.items.length > 0 && (
            <div className="mt-1 max-w-56 space-y-0.5">
              {tooltip.items.map((item, index) => (
                <div key={index} className="flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    aria-hidden="true"
                    className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: `var(--color-rel-${item.kind})` }}
                  />
                  <span>{item.direction === 'mutual' ? '↔' : item.from === tooltip.name ? '→' : '←'} {item.other}</span>
                  <span className="truncate text-[var(--color-text-secondary)]">{item.label}</span>
                  {item.sourceChapter && <span className="text-[var(--color-text-muted)]">· {text(`第${item.sourceChapter}章`, `Ch. ${item.sourceChapter}`)}</span>}
                </div>
              ))}
              {tooltip.items.some(item => item.evidence) && (
                <div className="mt-1 space-y-0.5 border-t pt-1 text-[var(--color-text-muted)]" style={{ borderColor: 'var(--color-border)' }}>
                  {tooltip.items.filter(item => item.evidence).slice(0, 3).map((item, index) => <div key={`evidence-${index}`} className="truncate">{item.evidence}</div>)}
                </div>
              )}
              {tooltip.more > 0 && (
                <div className="text-[var(--color-text-muted)]">
                  {text(`还有 ${tooltip.more} 条…`, `+${tooltip.more} more…`)}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      <canvas
        ref={canvasRef}
        className="h-full w-full"
        style={{ background: 'transparent', color: 'var(--color-text)', cursor: 'grab' }}
        onWheel={(event) => {
          event.preventDefault()
          userInteractedRef.current = true
          const rect = event.currentTarget.getBoundingClientRect()
          updateZoom(
            viewRef.current.scale + (event.deltaY < 0 ? 0.1 : -0.1),
            event.clientX - rect.left,
            event.clientY - rect.top,
          )
        }}
        onPointerDown={(event) => {
          userInteractedRef.current = true
          pointerDownRef.current = { x: event.clientX, y: event.clientY }
          dragRef.current = { x: event.clientX, y: event.clientY }
          updateCursor(true, true)
          event.currentTarget.setPointerCapture(event.pointerId)
        }}
        onPointerMove={handlePointerMove}
        onPointerUp={(event) => {
          const down = pointerDownRef.current
          pointerDownRef.current = null
          dragRef.current = null
          updateCursor(!!hoverRef.current, false)
          event.currentTarget.releasePointerCapture(event.pointerId)
          if (!down) return
          // 位移极小视为单击：命中节点则固定/取消固定，点空白解除固定
          const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
          if (moved >= 5) return
          const canvas = event.currentTarget
          const rect = canvas.getBoundingClientRect()
          const w = canvas.width / 2
          const h = canvas.height / 2
          const content = screenToContent(event.clientX - rect.left, event.clientY - rect.top, w, h)
          const hit = hitNode(content.x, content.y)
          if (hit && pinnedRef.current?.name === hit.name) {
            pinnedRef.current = null
            setTooltip(null)
          } else if (hit) {
            pinnedRef.current = { name: hit.name, neighbors: buildNeighbors(hit.name) }
            showTooltipFor(hit, w, h)
          } else if (pinnedRef.current) {
            pinnedRef.current = null
            setTooltip(null)
          }
          drawRef.current?.()
        }}
        onPointerCancel={() => {
          pointerDownRef.current = null
          dragRef.current = null
          updateCursor(!!hoverRef.current, false)
        }}
        onPointerLeave={endHover}
      />
    </div>
  )
}
