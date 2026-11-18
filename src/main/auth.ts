import { app, safeStorage, shell } from 'electron'
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  InteractionRequiredAuthError,
  PublicClientApplication,
  type AccountInfo,
  type AuthenticationResult,
  type ICachePlugin
} from '@azure/msal-node'
import { CONSENT_REQUIRED, SIGN_IN_REQUIRED } from '../shared/api'

// All of these can be consented to by a regular user in most tenants.
export const BASE_SCOPES = [
  'User.Read',
  'Team.ReadBasic.All',
  'Channel.ReadBasic.All',
  'ChannelMessage.Send',
  'Chat.ReadWrite'
]

// Reading channel messages needs admin consent, so it is requested separately
// and chats keep working when an admin hasn't approved it.
export const CHANNEL_READ_SCOPES = [...BASE_SCOPES, 'ChannelMessage.Read.All']

// Searching the directory (new DMs, @-mentions of people you haven't chatted with) was added later, so it is
// also requested separately: existing sign-ins keep working until the user (or an admin) approves it.
export const PEOPLE_SCOPES = [...BASE_SCOPES, 'User.ReadBasic.All']

// Creating channels needs admin consent and is optional, so it is only requested when someone creates one.
export const CHANNEL_CREATE_SCOPES = [...BASE_SCOPES, 'Channel.Create']

const cachePath = (): string => join(app.getPath('userData'), 'msal-cache.bin')

/**
 * Whether tokens can be saved encrypted with the system's secret store: the keychain on the Mac, or GNOME Keyring /
 * KWallet on Linux. Without one, Linux falls back to a fixed, built-in key ("basic_text"), which isn't real
 * protection, so tokens then stay in memory and people sign in again each time Sleam starts.
 */
export function canSaveTokens(): boolean {
  if (!safeStorage.isEncryptionAvailable()) return false
  return process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'
}

// Persists MSAL's token cache, encrypted. Never writes tokens in the clear.
const cachePlugin: ICachePlugin = {
  async beforeCacheAccess(ctx) {
    if (!canSaveTokens() || !existsSync(cachePath())) return
    try {
      ctx.tokenCache.deserialize(safeStorage.decryptString(readFileSync(cachePath())))
    } catch (err) {
      console.warn('Discarding unreadable token cache:', err)
    }
  },
  async afterCacheAccess(ctx) {
    if (!ctx.cacheHasChanged) return
    if (!canSaveTokens()) {
      // Nothing to save to, so drop any file left from when a secret store was available.
      rmSync(cachePath(), { force: true })
      return
    }
    writeFileSync(cachePath(), safeStorage.encryptString(ctx.tokenCache.serialize()), { mode: 0o600 })
  }
}

export class Auth {
  private pca: PublicClientApplication
  private account: AccountInfo | null = null

  constructor(clientId: string, tenantId?: string) {
    this.pca = new PublicClientApplication({
      auth: { clientId, authority: `https://login.microsoftonline.com/${tenantId || 'organizations'}` },
      cache: { cachePlugin }
    })
  }

  /** The signed-in user's home tenant (needed by some Graph calls). */
  get tenantId(): string | undefined {
    return this.account?.tenantId
  }

  /** Picks up the account from a previous session, if any. */
  async restore(): Promise<boolean> {
    const [account] = await this.pca.getTokenCache().getAllAccounts()
    this.account = account ?? null
    return this.account !== null
  }

  async signIn(): Promise<void> {
    await this.interactive(BASE_SCOPES)
  }

  async grant(scopes: string[]): Promise<void> {
    await this.interactive(scopes)
  }

  async getToken(scopes: string[] = BASE_SCOPES): Promise<string> {
    if (!this.account) throw new Error(SIGN_IN_REQUIRED)
    try {
      const result = await this.pca.acquireTokenSilent({ account: this.account, scopes })
      return result.accessToken
    } catch (err) {
      if (!(err instanceof InteractionRequiredAuthError)) throw err
      // Never pop a browser from a background poll; let the UI ask the user.
      throw new Error(scopes === BASE_SCOPES ? SIGN_IN_REQUIRED : CONSENT_REQUIRED)
    }
  }

  async signOut(): Promise<void> {
    if (this.account) await this.pca.getTokenCache().removeAccount(this.account)
    this.account = null
    rmSync(cachePath(), { force: true })
  }

  private async interactive(scopes: string[]): Promise<AuthenticationResult> {
    const result = await this.pca.acquireTokenInteractive({
      scopes,
      openBrowser: async (url) => {
        await shell.openExternal(url)
      },
      successTemplate: '<h2>Signed in to Sleam.</h2><p>You can close this tab and return to the app.</p>',
      errorTemplate: '<h2>Sign-in failed.</h2><p>{error}</p>'
    })
    if (!result.account) throw new Error('Sign-in did not return an account')
    this.account = result.account
    return result
  }
}
