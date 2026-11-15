import { SearchIcon } from './Icons'

interface Props {
  query: string
  onQuery: (q: string) => void
  /** Enter: search message text (typing alone only filters the sidebar). */
  onSearch: (q: string) => void
  placeholder: string
}

export function TopBar({ query, onQuery, onSearch, placeholder }: Props) {
  return (
    <header className="topbar">
      <div className="topbar-search">
        <SearchIcon />
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onQuery('')
            if (e.key === 'Enter' && query.trim()) onSearch(query.trim())
          }}
          placeholder={placeholder}
          spellCheck={false}
          aria-label="Search"
        />
        {query.trim() && <span className="topbar-hint">↵ Search messages</span>}
      </div>
    </header>
  )
}
