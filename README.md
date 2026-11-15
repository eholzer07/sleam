# Sleam

A Slack-style desktop client for Microsoft Teams. Your organization keeps Teams as the system of record; you get
a sidebar of channels and DMs, threads in a side pane, and a familiar composer.

Sleam talks directly to [Microsoft Graph](https://learn.microsoft.com/graph/teams-concept-overview) from your
machine. There is no Sleam server, and messages never leave Microsoft 365 except to be shown on your screen.

> Status: early prototype, macOS first.

## What works

- Sign in with your work account (MSAL, system browser, tokens encrypted in the macOS keychain)
- Teams appear as workspaces in the left rail; channels and chats appear in the sidebar
- Read and post channel messages and threaded replies
- Read and post 1:1, group and meeting chats
- Slack-style formatting: `*bold*`, `_italic_`, `~strike~`, `` `code` ``, ```` ```blocks``` ````, auto-linked URLs
- Unreads view, with chat read state synced to Teams
- Mentions view, including mentions that arrived while the app was closed
- Create standard and private channels
- Message search across chats and channels (type in the search bar, press Enter); typing alone filters the sidebar
- New DMs and group DMs (⌘N), and @-mentions with autocomplete, including @channel and @team
- Unread and mention badges, a separate collapsible section for meeting chats
- Reactions, edited and deleted states, light and dark mode
- A demo workspace for trying the UI without a Microsoft 365 account

New messages arrive by polling (every 5 seconds for the open conversation, and on a tiered schedule for
everything else). Graph change notifications need a
public webhook endpoint, which doesn't fit a serverless desktop app.

## Using Sleam at work

- [Installing Sleam](docs/INSTALL.md): install, sign in and troubleshoot.
- [Requesting Sleam from IT](docs/IT-REQUEST.md): a ready-to-send request email, admin setup steps and a
  security overview.

## Running it

Requires Node.js 22.12 or newer.

```sh
npm install
npx install-electron   # Electron 45+ downloads its binary on demand
npm run dev            # development with hot reload
npm run dist:mac       # build a .dmg in dist/
```

Choose **Explore the demo workspace** on the sign-in screen to try the app without an account.

## Connecting to your Teams tenant

Sleam needs an app registration in Microsoft Entra ID. Each organization (or each user, where allowed) creates
its own, so no shared client ID is baked into the app.

1. Open the [Entra admin center](https://entra.microsoft.com) → **App registrations** → **New registration**.
2. Name it `Sleam`. Under supported account types, choose **this organizational directory only**.
3. Under **Redirect URI**, select **Public client/native (mobile & desktop)** and enter `http://localhost`.
4. Open **API permissions** → **Add a permission** → **Microsoft Graph** → **Delegated**, and add:

   | Permission | Used for | Admin consent |
   |---|---|---|
   | `User.Read` | Your name and ID | No |
   | `Team.ReadBasic.All` | Listing your teams | No |
   | `Channel.ReadBasic.All` | Listing channels | No |
   | `ChannelMessage.Send` | Posting in channels | No |
   | `Chat.ReadWrite` | Reading and sending chats | No |
   | `User.ReadBasic.All` | Finding people for new DMs and @-mentions | No |
   | `ChannelMessage.Read.All` | Reading channel messages | **Yes** |
   | `Channel.Create` | Creating channels (optional) | **Yes** |

5. Copy the **Application (client) ID** and **Directory (tenant) ID** into the Sleam sign-in screen.

Sleam asks for `ChannelMessage.Read.All` and `User.ReadBasic.All` separately, so chats work even before an
admin approves channel access, and existing sign-ins keep working when directory search is added. `Channel.Create`
is optional: it's only requested when someone creates a channel, so leave it out if you don't want that. Many tenants also block users from consenting to any app; in that case, an admin has to click **Grant
admin consent** on the API permissions page before anyone can sign in.

You can also set `SLEAM_CLIENT_ID` and `SLEAM_TENANT_ID` in the environment to prefill the sign-in form.

## Project layout

```
src/main/       Electron main process: auth (MSAL), Graph client, demo backend, IPC
src/preload/    Exposes the IPC API to the renderer as window.sleam
src/shared/     Types and API surface shared by both sides
src/renderer/   React UI
```

## Roadmap ideas

- Reactions, edits and deletes
- File and image attachments (Graph hosted content needs authenticated fetches)
- Desktop notifications and dock badge
- Presence and profile photos

## License

MIT
