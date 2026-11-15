import type { Channel, MentionCandidate, Person } from '../../../shared/api'

/** True when every word typed matches the start of a word in `name` (or the email), like Slack's pickers. */
export function matchesName(name: string, query: string, email?: string): boolean {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return true
  const parts = [...name.toLowerCase().split(/[\s,.()-]+/), email?.toLowerCase() ?? '']
  return words.every((w) => parts.some((p) => p.startsWith(w)))
}

/** Mention suggestions for a channel: recent posters and people you chat with, plus @channel and @team. */
export function channelMentionables(
  channel: Channel,
  teamName: string | undefined,
  authors: (Person | null)[],
  known: Person[],
  me: Person
): MentionCandidate[] {
  const people = uniqueById(authors.filter((a): a is Person => a !== null).reverse(), known).filter((p) => p.id !== me.id)
  return [
    ...people.map((p): MentionCandidate => ({ type: 'user', id: p.id, name: p.name, detail: p.email })),
    { type: 'channel', id: channel.id, name: channel.name },
    ...(teamName ? [{ type: 'team' as const, id: channel.teamId, name: teamName }] : [])
  ]
}

/** Merges lists, keeping the first occurrence of each id. */
export function uniqueById<T extends { id: string }>(...lists: T[][]): T[] {
  const seen = new Set<string>()
  return lists.flat().filter((item) => !seen.has(item.id) && seen.add(item.id))
}
