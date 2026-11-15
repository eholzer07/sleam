import { avatarColor, initials } from '../lib/format'

export function Avatar({ name, seed, size = 36 }: { name: string; seed?: string; size?: number }) {
  return (
    <div
      className="avatar"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        borderRadius: Math.round(size * 0.22),
        background: avatarColor(seed ?? name)
      }}
      aria-hidden
    >
      {initials(name)}
    </div>
  )
}
