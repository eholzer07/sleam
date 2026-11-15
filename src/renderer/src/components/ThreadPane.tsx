import type { Channel, Message, OutgoingMention, Person } from '../../../shared/api'
import { channelMentionables } from '../lib/people'
import { usePolling } from '../lib/usePolling'
import { Composer } from './Composer'
import { CloseIcon } from './Icons'
import { MessageItem } from './MessageItem'

interface Props {
  conversation: Channel
  root: Message
  me: Person
  knownPeople: Person[]
  teamName?: string
  onClose: () => void
}

export function ThreadPane({ conversation, root, me, knownPeople, teamName, onClose }: Props) {
  const replies = usePolling(() => window.sleam.listReplies(conversation, root.id), 5_000, [root.id])

  const authors = [root, ...(replies.data ?? [])].map((m) => m.author)
  const mentionables = channelMentionables(conversation, teamName, authors, knownPeople, me)

  async function send(html: string, mentions: OutgoingMention[]) {
    const sent = await window.sleam.sendMessage(conversation, html, root.id, mentions)
    replies.setData((prev) => [...(prev ?? []), sent])
  }

  const count = replies.data?.length ?? root.replyCount

  return (
    <aside className="thread">
      <header className="thread-header">
        <div>
          <h2>Thread</h2>
          <span className="muted"># {conversation.name}</span>
        </div>
        <button className="icon-button" onClick={onClose} title="Close">
          <CloseIcon />
        </button>
      </header>
      <div className="thread-scroll">
        <MessageItem message={root} />
        {count > 0 && (
          <div className="thread-divider">
            <span>
              {count} {count === 1 ? 'reply' : 'replies'}
            </span>
          </div>
        )}
        {replies.error && <div className="list-error">{replies.error}</div>}
        {replies.data?.map((reply) => <MessageItem key={reply.id} message={reply} />)}
      </div>
      <Composer placeholder="Reply…" onSend={send} mentionables={mentionables} searchDirectory />
    </aside>
  )
}
