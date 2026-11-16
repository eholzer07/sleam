/**
 * Color themes. A theme sets the app's frame colors (title bar, sidebar, selection, buttons, badges) plus the
 * content colors (links, mentions, code, search highlights) for light and dark mode. Everything is applied as
 * CSS variables on the root element, so styles.css only ever refers to tokens.
 */

/** The five colors a person can pick for a custom theme. */
export interface FrameColors {
  /** Title bar and team rail. */
  chrome: string
  sidebar: string
  /** Selected sidebar item and highlighted menu rows. */
  active: string
  /** Send and primary buttons. */
  accent: string
  /** Unread and mention badges. */
  badge: string
}

interface ModeColors {
  frame: FrameColors
  bg: string
  link: string
  code: string
  highlight: string
}

export interface Preset {
  id: string
  name: string
  light: ModeColors
  dark: ModeColors
  online: string
}

export const FRAME_ROLES: { key: keyof FrameColors; label: string }[] = [
  { key: 'chrome', label: 'Title bar' },
  { key: 'sidebar', label: 'Sidebar' },
  { key: 'active', label: 'Selected item' },
  { key: 'accent', label: 'Buttons' },
  { key: 'badge', label: 'Badges' }
]

export const PRESETS: Preset[] = [
  {
    id: 'harbor',
    name: 'Harbor',
    online: '#3fb39f',
    light: {
      frame: { chrome: '#0a2b2e', sidebar: '#0f3b3f', active: '#1f7a70', accent: '#1f7a70', badge: '#d9481f' },
      bg: '#ffffff',
      link: '#1b6f8a',
      code: '#b5432a',
      highlight: 'rgba(217, 164, 65, 0.35)'
    },
    dark: {
      frame: { chrome: '#061d1f', sidebar: '#0b2a2d', active: '#1f7a70', accent: '#1f7a70', badge: '#d9481f' },
      bg: '#151a1a',
      link: '#4fb3c9',
      code: '#e8916b',
      highlight: 'rgba(217, 164, 65, 0.3)'
    }
  },
  {
    id: 'ember',
    name: 'Ember',
    online: '#5fae6b',
    light: {
      frame: { chrome: '#1f1a19', sidebar: '#2b2523', active: '#c4561a', accent: '#c4561a', badge: '#d93f3f' },
      bg: '#ffffff',
      link: '#2f6fa3',
      code: '#b4441a',
      highlight: 'rgba(227, 155, 59, 0.35)'
    },
    dark: {
      frame: { chrome: '#141110', sidebar: '#1d1918', active: '#c4561a', accent: '#c4561a', badge: '#d93f3f' },
      bg: '#1b1918',
      link: '#6fa5d6',
      code: '#f0a06a',
      highlight: 'rgba(227, 155, 59, 0.3)'
    }
  },
  {
    id: 'moss',
    name: 'Moss',
    online: '#7cc59a',
    light: {
      frame: { chrome: '#162a21', sidebar: '#1f3a2e', active: '#94651a', accent: '#2f7d57', badge: '#c94a3f' },
      bg: '#ffffff',
      link: '#2f6f9f',
      code: '#a5462f',
      highlight: 'rgba(201, 154, 58, 0.35)'
    },
    dark: {
      frame: { chrome: '#0e1a14', sidebar: '#142319', active: '#94651a', accent: '#2f7d57', badge: '#c94a3f' },
      bg: '#171b19',
      link: '#6ba3cf',
      code: '#e39a7d',
      highlight: 'rgba(201, 154, 58, 0.3)'
    }
  },
  {
    id: 'ink',
    name: 'Ink',
    online: '#3fbf8f',
    light: {
      frame: { chrome: '#131e30', sidebar: '#1b2a41', active: '#2f6fdf', accent: '#2f6fdf', badge: '#e0483d' },
      bg: '#ffffff',
      link: '#2a62c9',
      code: '#c2402f',
      highlight: 'rgba(224, 169, 59, 0.35)'
    },
    dark: {
      frame: { chrome: '#0c1320', sidebar: '#121b2b', active: '#2f6fdf', accent: '#2f6fdf', badge: '#e0483d' },
      bg: '#161a21',
      link: '#6f9ff0',
      code: '#f08a7d',
      highlight: 'rgba(224, 169, 59, 0.3)'
    }
  }
]

/**
 * A preset, or custom frame colors on top of a preset. Custom colors apply in both light and dark mode; the base
 * preset still supplies the content colors.
 */
export type ThemeChoice = { preset: string } | { preset: string; custom: FrameColors }

const STORAGE_KEY = 'sleam.theme'
export const DEFAULT_THEME: ThemeChoice = { preset: 'harbor' }

export function presetById(id: string): Preset {
  return PRESETS.find((p) => p.id === id) ?? PRESETS[0]
}

export function loadTheme(): ThemeChoice {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (parsed && typeof parsed.preset === 'string') {
      if (!parsed.custom) return { preset: parsed.preset }
      if (FRAME_ROLES.every(({ key }) => isHex(parsed.custom[key]))) return parsed
    }
  } catch {
    // Fall back to the default.
  }
  return DEFAULT_THEME
}

export function saveTheme(choice: ThemeChoice): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(choice))
  } catch {
    // The theme still applies for this session.
  }
}

const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

/** The frame colors a choice shows in the current light/dark mode. */
export function frameColors(choice: ThemeChoice, dark = darkQuery.matches): FrameColors {
  if ('custom' in choice) return choice.custom
  const preset = presetById(choice.preset)
  return (dark ? preset.dark : preset.light).frame
}

let current: ThemeChoice = DEFAULT_THEME

export function applyTheme(choice: ThemeChoice): void {
  current = choice
  const preset = presetById(choice.preset)
  const mode = darkQuery.matches ? preset.dark : preset.light
  const frame = frameColors(choice)
  const vars: Record<string, string> = {
    chrome: frame.chrome,
    'chrome-fg': readableOn(frame.chrome),
    sidebar: frame.sidebar,
    'sidebar-fg': readableOn(frame.sidebar),
    active: frame.active,
    'active-fg': readableOn(frame.active),
    accent: frame.accent,
    'accent-fg': readableOn(frame.accent),
    badge: frame.badge,
    'badge-fg': readableOn(frame.badge),
    online: preset.online,
    bg: mode.bg,
    link: mode.link,
    'code-text': mode.code,
    highlight: mode.highlight
  }
  const root = document.documentElement.style
  for (const [name, value] of Object.entries(vars)) root.setProperty(`--${name}`, value)
}

/** Load the saved theme, apply it, and keep it in step with the system's light/dark setting. */
export function initTheme(): void {
  applyTheme(loadTheme())
  darkQuery.addEventListener('change', () => applyTheme(current))
}

export function isHex(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
}

/** The theme as a shareable string: the five frame colors, comma-separated. */
export function themeToString(frame: FrameColors): string {
  return FRAME_ROLES.map(({ key }) => frame[key]).join(',')
}

/**
 * Read a pasted theme. Takes Sleam's own five colors (title bar, sidebar, selected, buttons, badges), or a Slack
 * sidebar theme string (8–10 colors), so people can bring the colors they're used to.
 */
export function parseThemeString(text: string, fallback: FrameColors): FrameColors | null {
  const colors = text
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((c) => (c.startsWith('#') ? c : `#${c}`).toLowerCase())
    .map((c) => (/^#[0-9a-f]{3}$/.test(c) ? '#' + [...c.slice(1)].map((ch) => ch + ch).join('') : c))
  if (!colors.length || !colors.every(isHex)) return null
  if (colors.length === 5) {
    const [chrome, sidebar, active, accent, badge] = colors
    return { chrome, sidebar, active, accent, badge }
  }
  if (colors.length >= 8) {
    // Slack's order: column bg, menu bg, active item, active text, hover, text, presence, badge, top nav bg, top nav text.
    return {
      chrome: colors[8] ?? colors[1],
      sidebar: colors[0],
      active: colors[2],
      accent: fallback.accent,
      badge: colors[7]
    }
  }
  return null
}

/** White or near-black, whichever reads better on the given color. */
export function readableOn(hex: string): string {
  const l = luminance(hex)
  return (1.05 / (l + 0.05) >= (l + 0.05) / (luminance('#1d1c1d') + 0.05)) ? '#ffffff' : '#1d1c1d'
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5)
}
