/** The team Sleam opens at launch and lists first in the rail. Stored per device. */
const KEY = 'sleam.defaultTeam'

export function loadDefaultTeam(): string | null {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function saveDefaultTeam(teamId: string | null): void {
  try {
    if (teamId) localStorage.setItem(KEY, teamId)
    else localStorage.removeItem(KEY)
  } catch {
    // The choice still applies until Sleam restarts.
  }
}

/** The default team first, everything else in Microsoft's order. */
export function withDefaultFirst<T extends { id: string }>(teams: T[], defaultId: string | null): T[] {
  const index = defaultId ? teams.findIndex((t) => t.id === defaultId) : -1
  return index <= 0 ? teams : [teams[index], ...teams.slice(0, index), ...teams.slice(index + 1)]
}
