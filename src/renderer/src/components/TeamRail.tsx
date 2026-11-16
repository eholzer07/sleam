import { useState } from 'react'
import type { Person, Team } from '../../../shared/api'
import { initials } from '../lib/format'
import { Avatar } from './Avatar'

interface Props {
  teams: Team[]
  activeTeamId: string | null
  onSelect: (teamId: string) => void
  /** Teams with unread channels get a dot, like Slack's workspace switcher. */
  unreadTeams: Set<string>
  /** Unseen @-mentions per team (channels only). */
  teamMentions: Map<string, number>
  me: Person
  demo: boolean
  onSignOut: () => void
  onOpenTheme: () => void
}

export function TeamRail({ teams, activeTeamId, onSelect, unreadTeams, teamMentions, me, demo, onSignOut, onOpenTheme }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <nav className="rail">
      <div className="rail-teams">
        {teams.map((team) => (
          <button
            key={team.id}
            className={`rail-team ${team.id === activeTeamId ? 'active' : ''}`}
            title={team.name}
            onClick={() => onSelect(team.id)}
          >
            {initials(team.name)}
            {team.id !== activeTeamId &&
              (teamMentions.get(team.id) ? (
                <span className="rail-mentions" aria-label={`${teamMentions.get(team.id)} mentions`}>
                  {teamMentions.get(team.id)}
                </span>
              ) : (
                unreadTeams.has(team.id) && <span className="rail-unread" aria-label="Unread" />
              ))}
          </button>
        ))}
      </div>
      <div className="rail-footer">
        <button className="rail-me" onClick={() => setMenuOpen((open) => !open)} title={me.name}>
          <Avatar name={me.name} seed={me.id} size={32} />
          <span className="presence" />
        </button>
        {menuOpen && (
          <>
            <div className="menu-backdrop" onClick={() => setMenuOpen(false)} />
            <div className="menu">
              <div className="menu-header">
                <Avatar name={me.name} seed={me.id} size={36} />
                <div>
                  <strong>{me.name}</strong>
                  <div className="muted">{demo ? 'Demo workspace' : 'Microsoft Teams'}</div>
                </div>
              </div>
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false)
                  onOpenTheme()
                }}
              >
                Theme…<span className="menu-shortcut">⌘,</span>
              </button>
              <button className="menu-item" onClick={onSignOut}>
                {demo ? 'Leave demo' : 'Sign out'}
              </button>
            </div>
          </>
        )}
      </div>
    </nav>
  )
}
