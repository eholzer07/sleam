import { useEffect, useState } from 'react'
import { CHANNEL_GONE, CONSENT_REQUIRED, type Conversation, type MentionCandidate, type Message, type OutgoingMention, type Person } from '../../../shared/api'
import { channelMentionables } from '../lib/people'
import { errorText, usePolling } from '../lib/usePolling'
import { Avatar } from './Avatar'
import { Composer } from './Composer'
import { HashIcon } from './Icons'
import { MessageList } from './MessageList'

interface Props {
  conversation: Conversation
  me: Person
  /** People from the user's chats, suggested for @-mentions in channels. */
  knownPeople: Person[]
  teamName?: string
  onOpenThread: (message: Message) => void
  /** The channel was deleted in Teams (Graph answered 410). */
  onChannelGone?: (channelId: string) => void
}

export function ConversationView({ conversation, me, knownPeople, teamName, onOpenThread, onChannelGone }: Props) {
  const messages = usePolling(() => window.sleam.listMessages(conversation), 5_000, [conversation.id])
  const gone = conversation.kind === 'channel' && !!messages.error?.includes(CHANNEL_GONE)
  useEffect(() => {
    if (gone) onChannelGone?.(conversation.id)
  }, [gone, conversation.id, onChannelGone])
  const others = conversation.kind === 'chat' ? conversation.members.filter((m) => m.id !== me.id) : []
  const placeholder = conversation.kind === 'channel' ? `Message #${conversation.name}` : `Message ${conversation.name}`

  // A chat can only mention its members; a channel can mention anyone, so it also searches the directory.
  const mentionables: MentionCandidate[] =
    conversation.kind === 'chat'
      ? others.map((p) => ({ type: 'user', id: p.id, name: p.name }))
      : channelMentionables(conversation, teamName, (messages.data ?? []).map((m) => m.author), knownPeople, me)

  async function send(html: string, mentions: OutgoingMention[]) {
    const sent = await window.sleam.sendMessage(conversation, html, undefined, mentions)
    messages.setData((prev) => [...(prev ?? []), sent])
  }

  return (
    <div className="conversation">
      <header className="conversation-header">
        <div className="conversation-title">
          {conversation.kind === 'channel' ? (
            <HashIcon />
          ) : (
            <Avatar name={conversation.name} seed={others[0]?.id} size={22} />
          )}
          <h1>{conversation.name}</h1>
        </div>
        {conversation.kind === 'channel' && conversation.description && (
          <div className="conversation-topic">{conversation.description}</div>
        )}
        {conversation.kind === 'chat' && conversation.members.length > 2 && (
          <div className="conversation-topic">{conversation.members.length} members</div>
        )}
      </header>

      {gone ? (
        <div className="empty channel-gone">
          <strong>#{conversation.name} was deleted</strong>
          <span>Someone deleted this channel in Microsoft Teams, so its messages are no longer available.</span>
        </div>
      ) : messages.error?.includes(CONSENT_REQUIRED) ? (
        <ConsentPrompt onGranted={messages.refresh} />
      ) : (
        <MessageList
          messages={messages.data}
          error={messages.error}
          onOpenThread={conversation.kind === 'channel' ? onOpenThread : undefined}
        />
      )}

      {!gone && <Composer
        placeholder={placeholder}
        onSend={send}
        mentionables={mentionables}
        searchDirectory={conversation.kind === 'channel'}
      />}
    </div>
  )
}

function ConsentPrompt({ onGranted }: { onGranted: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function grant() {
    setBusy(true)
    setError(null)
    try {
      await window.sleam.grantChannelAccess()
      onGranted()
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="consent">
      <h2>Channel messages need one more permission</h2>
      <p>
        Reading channel messages uses Microsoft's <code>ChannelMessage.Read.All</code> permission, which usually needs
        approval from your IT admin. Chats and direct messages work without it.
      </p>
      <button className="btn-primary" onClick={grant} disabled={busy}>
        {busy ? 'Continue in your browser…' : 'Grant access'}
      </button>
      {error && <div className="signin-error">{error}</div>}
    </div>
  )
}
