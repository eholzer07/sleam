import { useState } from 'react'
import {
  FRAME_ROLES,
  PRESETS,
  applyTheme,
  frameColors,
  isHex,
  loadTheme,
  parseThemeString,
  saveTheme,
  themeToString,
  type FrameColors,
  type ThemeChoice
} from '../lib/theme'
import { CloseIcon } from './Icons'

interface Props {
  onClose: () => void
}

/** Pick a preset theme or your own colors. Changes apply and save immediately, so the app behind is the preview. */
export function ThemeDialog({ onClose }: Props) {
  const [choice, setChoice] = useState<ThemeChoice>(loadTheme)
  const isCustom = 'custom' in choice
  const [pasted, setPasted] = useState('')
  const [pasteProblem, setPasteProblem] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function choose(next: ThemeChoice) {
    setChoice(next)
    applyTheme(next)
    saveTheme(next)
  }

  function startCustom() {
    if (!isCustom) choose({ preset: choice.preset, custom: { ...frameColors(choice) } })
  }

  function setColor(key: keyof FrameColors, value: string) {
    if (!isCustom || !isHex(value)) return
    choose({ preset: choice.preset, custom: { ...choice.custom, [key]: value.toLowerCase() } })
  }

  function applyPasted() {
    const current = frameColors(choice)
    const parsed = parseThemeString(pasted, current)
    if (!parsed) {
      setPasteProblem('Paste 5 colors (title bar, sidebar, selected item, buttons, badges) or a Slack sidebar theme string.')
      return
    }
    setPasteProblem(null)
    setPasted('')
    choose({ preset: choice.preset, custom: parsed })
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(themeToString(frameColors(choice)))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Clipboard unavailable; the string is still visible to select.
    }
  }

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="dialog theme-dialog"
        role="dialog"
        aria-modal
        aria-labelledby="theme-title"
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      >
        <header className="dialog-header">
          <h2 id="theme-title">Theme</h2>
          <button type="button" className="icon-button" onClick={onClose} title="Close (Esc)">
            <CloseIcon />
          </button>
        </header>
        <div className="dialog-body">
          <div className="theme-grid" role="radiogroup" aria-label="Theme">
            {PRESETS.map((preset) => {
              const selected = !isCustom && choice.preset === preset.id
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  className={`theme-card ${selected ? 'selected' : ''}`}
                  onClick={() => choose({ preset: preset.id })}
                  autoFocus={selected}
                >
                  <ThemeSwatch frame={frameColors({ preset: preset.id })} />
                  <span>{preset.name}</span>
                </button>
              )
            })}
            <button
              type="button"
              role="radio"
              aria-checked={isCustom}
              className={`theme-card ${isCustom ? 'selected' : ''}`}
              onClick={startCustom}
              autoFocus={isCustom}
            >
              <ThemeSwatch frame={frameColors(choice)} custom />
              <span>Custom</span>
            </button>
          </div>

          {isCustom && (
            <>
              <div className="theme-colors">
                {FRAME_ROLES.map(({ key, label }) => (
                  <ColorField
                    key={key}
                    id={`theme-${key}`}
                    label={label}
                    value={choice.custom[key]}
                    onChange={(v) => setColor(key, v)}
                  />
                ))}
              </div>

              <label className="field-label" htmlFor="theme-paste">
                Paste a theme
              </label>
              <div className={`field-input ${pasteProblem ? 'invalid' : ''}`}>
                <input
                  id="theme-paste"
                  value={pasted}
                  onChange={(e) => {
                    setPasted(e.target.value)
                    setPasteProblem(null)
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && pasted.trim() && applyPasted()}
                  placeholder="#0a2b2e,#0f3b3f,#1f7a70,#1f7a70,#d9481f"
                  spellCheck={false}
                />
                <button type="button" className="theme-inline-btn" onClick={applyPasted} disabled={!pasted.trim()}>
                  Apply
                </button>
              </div>
              {pasteProblem ? (
                <div className="field-problem">{pasteProblem}</div>
              ) : (
                <p className="muted theme-help">Five colors in the order above, or a sidebar theme string copied from Slack.</p>
              )}
            </>
          )}
        </div>
        <footer className="dialog-footer">
          <button type="button" className="theme-share" onClick={copy} title="Copy these colors to share them">
            <code>{themeToString(frameColors(choice))}</code>
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button type="button" className="btn-primary dialog-go" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}

function ThemeSwatch({ frame, custom }: { frame: FrameColors; custom?: boolean }) {
  return (
    <span className={`theme-swatch ${custom ? 'custom' : ''}`} aria-hidden>
      <span style={{ background: frame.chrome }} />
      <span className="theme-swatch-side" style={{ background: frame.sidebar }}>
        <i style={{ background: frame.active }} />
        <b style={{ background: frame.badge }} />
      </span>
      <span className="theme-swatch-main">
        <i style={{ background: frame.accent }} />
      </span>
    </span>
  )
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    // Picked or pasted elsewhere: show the new value.
    setLastValue(value)
    setText(value)
  }
  return (
    <div className="theme-color">
      <input type="color" id={id} value={value} onChange={(e) => onChange(e.target.value)} />
      <label htmlFor={id}>{label}</label>
      <input
        className="theme-hex"
        aria-label={`${label} hex`}
        value={text}
        spellCheck={false}
        maxLength={7}
        onChange={(e) => {
          const next = e.target.value.startsWith('#') ? e.target.value : `#${e.target.value}`
          setText(next)
          if (isHex(next)) onChange(next)
        }}
        onBlur={() => setText(value)}
      />
    </div>
  )
}
