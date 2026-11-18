/** The few places the Mac and Linux builds differ in the window: shortcut keys and their labels. */

export const isMac = /Mac/.test(navigator.platform)

/** True when the platform's command key is held: ⌘ on the Mac, Ctrl elsewhere. */
export function hasModKey(e: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey
}

/** A shortcut label in the platform's style, such as ⌘N on the Mac and Ctrl+N elsewhere. */
export function shortcut(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`
}
