type PreferenceValidator = (value: unknown) => boolean

interface PreferenceMigrationOptions {
  targetKey: string
  suffix: '-theme' | '-layout'
  validate: PreferenceValidator
}

const THEME_VALUES = new Set(['light', 'galaxy', 'paper', 'dark', 'night', 'system'])
const FONT_VALUES = new Set(['inter', 'noto-sans-sc', 'lxgw-wenkai', 'noto-serif-sc', 'system'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort()
  return actual.length === expected.length && actual.every((key, index) => key === [...expected].sort()[index])
}

function isPreV1Envelope(value: unknown): value is { state: Record<string, unknown>; version?: number } {
  if (!isRecord(value) || !isRecord(value.state)) return false
  if (!hasExactKeys(value, value.version === undefined ? ['state'] : ['state', 'version'])) return false
  return value.version === undefined || value.version === 0
}

export function isPreV1ThemePreference(value: unknown) {
  if (!isPreV1Envelope(value) || !hasExactKeys(value.state, ['theme', 'uiFont', 'writingFont', 'zoom'])) return false
  return THEME_VALUES.has(String(value.state.theme))
    && FONT_VALUES.has(String(value.state.uiFont))
    && FONT_VALUES.has(String(value.state.writingFont))
    && typeof value.state.zoom === 'number'
    && Number.isFinite(value.state.zoom)
    && value.state.zoom >= 0.7
    && value.state.zoom <= 1.5
}

export function isPreV1LayoutPreference(value: unknown) {
  if (!isPreV1Envelope(value) || !hasExactKeys(value.state, ['bottomPanelFloating', 'floatingBounds'])) return false
  const bounds = value.state.floatingBounds
  if (typeof value.state.bottomPanelFloating !== 'boolean' || !isRecord(bounds)) return false
  if (!hasExactKeys(bounds, ['height', 'width', 'x', 'y'])) return false
  return ['x', 'y', 'width', 'height'].every((field) => (
    typeof bounds[field] === 'number' && Number.isFinite(bounds[field])
  )) && Number(bounds.width) >= 200 && Number(bounds.height) >= 100
}

function candidateKey(key: string, targetKey: string, suffix: string) {
  if (key === targetKey || !key.endsWith(suffix)) return false
  const prefix = key.slice(0, -suffix.length)
  return /^[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(prefix)
}

export function migrateUnambiguousPreV1Preference(
  storage: Storage,
  { targetKey, suffix, validate }: PreferenceMigrationOptions,
) {
  try {
    if (storage.getItem(targetKey) !== null) return false
    const candidates: Array<{ key: string; raw: string }> = []
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (!key || !candidateKey(key, targetKey, suffix)) continue
      const raw = storage.getItem(key)
      if (raw === null) continue
      let parsed: unknown
      try { parsed = JSON.parse(raw) } catch { continue }
      if (validate(parsed)) candidates.push({ key, raw })
    }
    if (candidates.length !== 1) return false
    const selected = candidates[0]
    storage.setItem(targetKey, selected.raw)
    if (storage.getItem(targetKey) !== selected.raw) return false
    storage.removeItem(selected.key)
    return storage.getItem(selected.key) === null
  } catch {
    return false
  }
}

export function migratePreV1PreferenceIfAvailable(options: PreferenceMigrationOptions) {
  if (typeof localStorage === 'undefined') return false
  return migrateUnambiguousPreV1Preference(localStorage, options)
}
