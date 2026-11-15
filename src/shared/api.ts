// Types and IPC surface shared by the main process, preload script and renderer.

export interface Person {
  id: string
  name: string
  /** Shown in people pickers to tell apart people with the same name. */
  email?: string
}

export interface Team {
  id: string
  name: string
  description?: string
}

export interface Channel {
  kind: 'channel'
  id: string
  teamId: string
  name: string
  description?: string
}

export interface Chat {
  kind: 'chat'
  id: string
  name: string
  chatType: string
  members: Person[]
  lastActivity?: string
  /** When the user last read this chat on any device (from Teams); undefined if unknown. */
  lastReadAt?: string
}

/** One batch of chats, newest first; pass `olderCursor` back to fetch the next-older batch. */
export interface ChatPage {
  chats: Chat[]
  olderCursor?: string
}

export type Conversation = Channel | Chat

export interface ConversationRef {
  kind: Conversation['kind']
  id: string
  teamId?: string
}

export interface Reaction {
  emoji: string
  count: number
  mine: boolean
}

/** Who a message @-mentions: a person, or everyone in a channel or team. */
export interface MentionTarget {
  type: 'user' | 'channel' | 'team'
  id: string
}

/** Someone, or everyone in a channel or team, who can be @-mentioned from the composer. */
export interface MentionCandidate extends MentionTarget {
  name: string
  /** Extra detail for the suggestion list, e.g. an email address. */
  detail?: string
}

/** An @-mention in an outgoing message; the HTML refers to it as <at id="{id}">{target.name}</at>. */
export interface OutgoingMention {
  id: number
  target: MentionCandidate
}

export interface Message {
  id: string
  /** Set on thread replies. */
  replyToId?: string
  mentions?: MentionTarget[]
  author: Person | null
  createdAt: string
  html: string
  replyCount: number
  reactions: Reaction[]
  edited: boolean
  deleted: boolean
}

export interface Mention {
  /** `${conversationId}:${messageId}` */
  id: string
  kind: 'you' | 'channel' | 'team'
  conversation: ConversationRef & { name: string }
  messageId: string
  replyToId?: string
  author: Person | null
  createdAt: string
  /** Plain text, safe to render as text. */
  excerpt: string
  seen: boolean
}

export interface MentionsState {
  mentions: Mention[]
  /** Set while scanning a gap longer than the normal cadence (e.g. after the computer was off). */
  catchingUp: { since: string; done: number; total: number } | null
  lastScanAt?: string
  error?: string
}

/**
 * Read state for a channel. Graph has no channel read state, so Sleam tracks it locally:
 * `latestAt` is the newest message from someone else seen by the background scan.
 */
export interface ChannelActivity {
  channel: Channel
  teamName: string
  latestAt?: string
  lastReadAt: string
}

/** A message found by search; `snippet` alternates plain text and matched text (odd indexes are matches). */
export interface SearchResult {
  id: string
  conversation: ConversationRef
  /** Set when the message is a reply in a channel thread. */
  replyToId?: string
  author: Person | null
  createdAt: string
  snippet: string[]
}

export interface SearchPage {
  results: SearchResult[]
  /** Pass back as `offset` for the next page. */
  nextOffset?: number
}

export interface NewChannel {
  name: string
  description?: string
  private: boolean
}

export interface AppConfig {
  clientId?: string
  tenantId?: string
}

export interface AuthState {
  mode: 'signedOut' | 'graph' | 'demo'
  me?: Person
  config: AppConfig
}

/** A source of teams, conversations and messages (Microsoft Graph or the demo data). */
export interface Backend {
  readonly me: Person
  listTeams(): Promise<Team[]>
  listChannels(teamId: string): Promise<Channel[]>
  listChats(cursor?: string): Promise<ChatPage>
  listMessages(ref: ConversationRef): Promise<Message[]>
  listReplies(ref: ConversationRef, messageId: string): Promise<Message[]>
  sendMessage(ref: ConversationRef, html: string, replyToId?: string, mentions?: OutgoingMention[]): Promise<Message>
  /** People in the organization's directory whose name or email matches `query`. */
  searchPeople(query: string): Promise<Person[]>
  /** Starts a 1:1 chat (one person; returns the existing one if there is one) or a new group chat. */
  createChat(people: Person[]): Promise<Chat>
  /** Searches messages in the user's chats and channels, newest first. */
  searchMessages(query: string, offset?: number): Promise<SearchPage>
  /** Creates a channel in a team; a private one starts with just the signed-in user (as owner). */
  createChannel(teamId: string, channel: NewChannel): Promise<Channel>
  /** Messages, including thread replies, created or changed after `since`; used by the mention scanner. */
  listMessagesSince(ref: ConversationRef, since: string): Promise<Message[]>
  /**
   * Channel messages (roots and thread replies) changed since `since`, or since an earlier call when given
   * that call's `cursor`. The returned cursor makes the next check of a quiet channel cheap.
   */
  listChannelChanges(channel: ConversationRef, since: string, cursor?: string): Promise<{ messages: Message[]; cursor?: string }>
  /** Marks a chat read in Teams itself, so other devices see it as read too. */
  markChatRead(chatId: string): Promise<void>
  /** Demo only: seeds a channel's read state the first time it's seen (real channels start out read). */
  initialChannelReadAt?(channel: Channel): string | undefined
}

export type SleamApi = Omit<Backend, 'me' | 'markChatRead' | 'initialChannelReadAt' | 'listChannelChanges'> & {
  /** The team being viewed; its channels are checked for activity more often. */
  setCurrentTeam(teamId: string | null): Promise<void>
  /** Marks a chat (synced to Teams) or channel (local) as read up to now. */
  markRead(ref: ConversationRef): Promise<void>
  getChannelActivity(): Promise<ChannelActivity[]>
  getMentions(): Promise<MentionsState>
  markMentionsSeen(ids: string[]): Promise<void>
  getAuthState(): Promise<AuthState>
  signIn(config: AppConfig): Promise<AuthState>
  startDemo(): Promise<AuthState>
  signOut(): Promise<AuthState>
  grantChannelAccess(): Promise<void>
  /** Asks for the permission to search the directory (User.ReadBasic.All). */
  grantPeopleAccess(): Promise<void>
  /** Asks for the permission to create channels (Channel.Create, which needs admin consent). */
  grantChannelCreateAccess(): Promise<void>
}

export const API_METHODS = [
  'getAuthState',
  'signIn',
  'startDemo',
  'signOut',
  'grantChannelAccess',
  'grantPeopleAccess',
  'searchPeople',
  'createChat',
  'createChannel',
  'searchMessages',
  'grantChannelCreateAccess',
  'listTeams',
  'listChannels',
  'listChats',
  'listMessages',
  'listReplies',
  'sendMessage',
  'getMentions',
  'markMentionsSeen',
  'listMessagesSince',
  'markRead',
  'getChannelActivity',
  'setCurrentTeam'
] as const satisfies readonly (keyof SleamApi)[]

/** Error codes thrown across IPC; the renderer matches on these substrings. */
export const SIGN_IN_REQUIRED = 'SIGN_IN_REQUIRED'
export const CONSENT_REQUIRED = 'CONSENT_REQUIRED'
