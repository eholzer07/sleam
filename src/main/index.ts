import { app, BrowserWindow, ipcMain, powerMonitor, shell } from 'electron'
import { cpSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { API_METHODS, SIGN_IN_REQUIRED, type AuthState, type Backend, type SleamApi } from '../shared/api'
import { Auth, CHANNEL_CREATE_SCOPES, CHANNEL_READ_SCOPES, PEOPLE_SCOPES } from './auth'
import { loadConfig, saveConfig } from './config'
import { GraphBackend } from './graph'
import { ActivityScanner } from './activity'
import { MockBackend } from './mock'

/**
 * The app used to be called Slackish. Copy its data (settings, mentions store, local storage) to the new
 * name once. Electron creates the new folder before this runs, so "set up yet" means it has a config.json.
 * Only for the default location, so a custom --user-data-dir is left alone. The saved sign-in doesn't carry
 * over: it's encrypted with a keychain key tied to the old name, so users sign in once more.
 */
function migrateFromOldName(): void {
  const appData = app.getPath('appData')
  const current = app.getPath('userData')
  const old = join(appData, 'Slackish')
  if (current !== join(appData, app.getName()) || !existsSync(old) || existsSync(join(current, 'config.json'))) return
  try {
    for (const name of ['config.json', 'mentions', 'Local Storage']) {
      if (existsSync(join(old, name))) cpSync(join(old, name), join(current, name), { recursive: true, force: true })
    }
    rmSync(old, { recursive: true, force: true })
  } catch (err) {
    console.warn('Could not copy data from the old app name:', err)
  }
}
migrateFromOldName()

let mainWindow: BrowserWindow | null = null
let auth: Auth | null = null
let backend: Backend | null = null
let mode: AuthState['mode'] = 'signedOut'
let activity: ActivityScanner | null = null

/** (Re)starts activity scanning (mentions, channel unreads) for the current account; each account/demo keeps its own store. */
function startMentions(): void {
  activity?.stop()
  activity = null
  if (!backend) return
  const owner = `${mode}-${backend.me.id}`.replace(/[^a-zA-Z0-9_-]/g, '_')
  // The folder is still called "mentions" so existing stores keep loading.
  activity = new ActivityScanner(backend, join(app.getPath('userData'), 'mentions', `${owner}.json`))
  activity.start()
}

function authState(): AuthState {
  const { clientId, tenantId } = loadConfig()
  return { mode, me: backend?.me, config: { clientId, tenantId } }
}

async function connectGraph(signedIn: Auth): Promise<void> {
  backend = await GraphBackend.connect((scopes) => signedIn.getToken(scopes), signedIn.tenantId)
  auth = signedIn
  mode = 'graph'
  startMentions()
}

function startDemo(): void {
  auth = null
  backend = new MockBackend()
  mode = 'demo'
  startMentions()
}

async function restoreSession(): Promise<void> {
  const config = loadConfig()
  if (config.demo) return startDemo()
  if (!config.clientId) return
  const restored = new Auth(config.clientId, config.tenantId)
  try {
    if (await restored.restore()) await connectGraph(restored)
  } catch (err) {
    console.warn('Could not restore the previous session:', err)
  }
}

function requireBackend(): Backend {
  if (!backend) throw new Error(SIGN_IN_REQUIRED)
  return backend
}

const api: SleamApi = {
  getAuthState: async () => authState(),
  signIn: async ({ clientId, tenantId }) => {
    const config = { clientId: clientId?.trim(), tenantId: tenantId?.trim() || undefined }
    if (!config.clientId) throw new Error('An application (client) ID is required.')
    const signingIn = new Auth(config.clientId, config.tenantId)
    await signingIn.signIn()
    saveConfig(config)
    await connectGraph(signingIn)
    mainWindow?.show()
    app.focus({ steal: true })
    return authState()
  },
  startDemo: async () => {
    saveConfig({ ...loadConfig(), demo: true })
    startDemo()
    return authState()
  },
  signOut: async () => {
    await auth?.signOut()
    auth = null
    backend = null
    mode = 'signedOut'
    startMentions()
    saveConfig({ ...loadConfig(), demo: false })
    return authState()
  },
  grantChannelAccess: async () => {
    await auth?.grant(CHANNEL_READ_SCOPES)
    app.focus({ steal: true })
  },
  grantPeopleAccess: async () => {
    await auth?.grant(PEOPLE_SCOPES)
    app.focus({ steal: true })
  },
  grantChannelCreateAccess: async () => {
    await auth?.grant(CHANNEL_CREATE_SCOPES)
    app.focus({ steal: true })
  },
  searchMessages: (query, offset) => requireBackend().searchMessages(query, offset),
  createChannel: (teamId, channel) => requireBackend().createChannel(teamId, channel),
  searchPeople: (query) => requireBackend().searchPeople(query),
  createChat: (people) => requireBackend().createChat(people),
  listTeams: () => requireBackend().listTeams(),
  listChannels: (teamId) => requireBackend().listChannels(teamId),
  listChats: (cursor) => requireBackend().listChats(cursor),
  // Messages loaded for the open channel/thread also feed the activity scanner (no extra Graph requests).
  listMessages: async (ref) => {
    const messages = await requireBackend().listMessages(ref)
    activity?.observe(ref, messages)
    return messages
  },
  listReplies: async (ref, messageId) => {
    const replies = await requireBackend().listReplies(ref, messageId)
    activity?.observe(ref, replies.map((r) => ({ ...r, replyToId: r.replyToId ?? messageId })))
    return replies
  },
  sendMessage: (ref, html, replyToId, mentions) => requireBackend().sendMessage(ref, html, replyToId, mentions),
  getMentions: async () => activity?.state() ?? { mentions: [], catchingUp: null },
  markMentionsSeen: async (ids) => activity?.markSeen(ids),
  listMessagesSince: (ref, since) => requireBackend().listMessagesSince(ref, since),
  markRead: async (ref) => {
    if (ref.kind === 'chat') await requireBackend().markChatRead(ref.id)
    else activity?.markChannelRead(ref.id)
  },
  getChannelActivity: async () => activity?.channelActivity() ?? [],
  setCurrentTeam: async (teamId) => activity?.setCurrentTeam(teamId)
}

function registerIpc(): void {
  for (const name of API_METHODS) {
    const handler = api[name] as (...args: unknown[]) => Promise<unknown>
    ipcMain.handle(`sleam:${name}`, (_event, ...args) => handler(...args))
  }
}

const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url)

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 860,
    minHeight: 560,
    title: 'Sleam',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 14, y: 13 },
    backgroundColor: '#3b0d3c',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  mainWindow = win
  win.once('ready-to-show', () => win.show())
  win.on('closed', () => {
    mainWindow = null
  })

  // Links in messages open in the default browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isWebUrl(url)) shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, url) => {
    if (url === win.webContents.getURL()) return
    event.preventDefault()
    if (isWebUrl(url)) shell.openExternal(url)
  })

  if (process.env.ELECTRON_RENDERER_URL) win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(async () => {
  registerIpc()
  // Catch up on activity right away after the Mac wakes instead of waiting for the next tick.
  powerMonitor.on('resume', () => activity?.wake())
  await restoreSession()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
