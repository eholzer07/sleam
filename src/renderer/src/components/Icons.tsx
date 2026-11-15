import type { ReactNode, SVGProps } from 'react'

function Icon({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden {...props}>
      {children}
    </svg>
  )
}

export const HashIcon = () => (
  <Icon>
    <path d="M7.5 3 6 17M14 3l-1.5 14M3.5 7.5h14M2.5 12.5h14" />
  </Icon>
)
export const SearchIcon = () => (
  <Icon>
    <circle cx="8.5" cy="8.5" r="5.5" />
    <path d="m13 13 4 4" />
  </Icon>
)
export const ChevronIcon = ({ open = true }: { open?: boolean }) => (
  <Icon style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform .1s' }}>
    <path d="m6 8 4 4 4-4" />
  </Icon>
)
export const SendIcon = () => (
  <Icon>
    <path d="M3 10 17 3l-4 14-3-6-7-1Z" />
  </Icon>
)
export const ThreadIcon = () => (
  <Icon>
    <path d="M4 4h12v9H9l-4 3v-3H4z" />
  </Icon>
)
export const CloseIcon = () => (
  <Icon>
    <path d="m5 5 10 10M15 5 5 15" />
  </Icon>
)
export const BoldIcon = () => (
  <Icon strokeWidth="2.2">
    <path d="M6 4h5a3 3 0 0 1 0 6H6zM6 10h6a3 3 0 0 1 0 6H6z" />
  </Icon>
)
export const ItalicIcon = () => (
  <Icon>
    <path d="M12 4H8.5M11.5 16H8M11 4l-2 12" />
  </Icon>
)
export const StrikeIcon = () => (
  <Icon>
    <path d="M3.5 10h13M13.5 6c-.5-1.5-2-2.5-3.5-2.5-2 0-3.5 1-3.5 2.75M6.5 14c.5 1.5 2 2.5 3.5 2.5 2.2 0 3.5-1.2 3.5-3" />
  </Icon>
)
export const CodeIcon = () => (
  <Icon>
    <path d="m7 6-4 4 4 4M13 6l4 4-4 4" />
  </Icon>
)
export const LinkIcon = () => (
  <Icon>
    <path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2l-.8.8M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l.8-.8" />
  </Icon>
)
export const ListIcon = () => (
  <Icon>
    <path d="M8 5h9M8 10h9M8 15h9" />
    <circle cx="4" cy="5" r=".6" fill="currentColor" />
    <circle cx="4" cy="10" r=".6" fill="currentColor" />
    <circle cx="4" cy="15" r=".6" fill="currentColor" />
  </Icon>
)
export const VideoIcon = () => (
  <Icon>
    <rect x="2.5" y="5.5" width="10.5" height="9" rx="2" />
    <path d="m13 9 4.5-2.5v7L13 11" />
  </Icon>
)
export const EyeOffIcon = () => (
  <Icon>
    <path d="M3 3l14 14M8.2 5.2A8 8 0 0 1 10 5c4.5 0 7.5 5 7.5 5a13 13 0 0 1-2.4 2.9M12.1 12.2A3 3 0 0 1 7.8 7.9M5.2 6.6A13 13 0 0 0 2.5 10s3 5 7.5 5c1.3 0 2.5-.4 3.5-1" />
  </Icon>
)
export const AtIcon = () => (
  <Icon>
    <circle cx="10" cy="10" r="3.2" />
    <path d="M13.2 10v1.3a2.2 2.2 0 0 0 4.4 0V10a7.6 7.6 0 1 0-3 6.1" />
  </Icon>
)
export const InboxIcon = () => (
  <Icon>
    <path d="M3 11.5 5 4.5h10l2 7v4H3z" />
    <path d="M3 11.5h4l1 2h4l1-2h4" />
  </Icon>
)
export const CheckIcon = () => (
  <Icon>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
)
export const PlusIcon = () => (
  <Icon>
    <path d="M10 4v12M4 10h12" />
  </Icon>
)
export const ComposeIcon = () => (
  <Icon>
    <path d="M9 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4" />
    <path d="M14.5 3.5a1.4 1.4 0 0 1 2 2L10 12l-2.5.5L8 10Z" />
  </Icon>
)
