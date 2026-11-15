# Requesting Sleam from IT

This page is for getting Sleam approved in your organization's Microsoft 365 tenant. It has three parts:

- [A request email](#request-email) you can copy, fill in and send to IT.
- [Setup steps for the administrator](#setup-steps-for-the-administrator).
- [Security and privacy details](#security-and-privacy-details) that IT will likely ask about.

## Request email

Replace the parts in `[brackets]`. If your IT team uses a ticketing system, paste it there instead.

---

**Subject:** Request: app registration for Sleam (Teams desktop client)

Hi [IT team / name],

I'd like to use Sleam, an open-source desktop app for Microsoft Teams, at work. It shows Teams channels and
chats in a Slack-style layout. It uses only the official Microsoft Graph API and my own signed-in account, so it
can see and do only what I already can in Teams.

To use it, our tenant needs an app registration with a few delegated Microsoft Graph permissions. Setup takes
about five minutes:

1. In the Entra admin center, create an app registration named **Sleam**, single tenant.
2. Add the redirect URI `http://localhost` under the **Mobile and desktop applications** platform.
3. Add these **delegated** Microsoft Graph permissions:
   - `User.Read`
   - `Team.ReadBasic.All`
   - `Channel.ReadBasic.All`
   - `ChannelMessage.Send`
   - `Chat.ReadWrite`
   - `User.ReadBasic.All`
   - `ChannelMessage.Read.All` (requires admin consent)
   - Optional: `Channel.Create` (requires admin consent), if I should be able to create channels from Sleam
4. Grant admin consent.
5. Send me the **Application (client) ID** and **Directory (tenant) ID**.

There are no application permissions and no client secret. Sleam has no server of its own: it runs on my Mac
and talks directly to Microsoft Graph. Its tokens are stored encrypted in the macOS keychain.

Detailed setup steps and a security overview are here: [link to this page]

You can limit the app to specific users by turning on **Assignment required** for its enterprise application,
and you can revoke it at any time by disabling or deleting the app registration.

Thanks,
[Your name]

---

## Setup steps for the administrator

These steps use the [Microsoft Entra admin center](https://entra.microsoft.com). You need a role that can create
app registrations and grant tenant-wide admin consent, such as **Cloud Application Administrator**,
**Privileged Role Administrator** or **Global Administrator**.

1. Go to **Identity → Applications → App registrations → New registration**.
2. **Name:** `Sleam`. **Supported account types:** *Single tenant only* (accounts in this organizational
   directory only).
3. **Redirect URI:** platform **Public client/native (mobile & desktop)**, value `http://localhost`. Click
   **Register**.

   Sleam signs in through the system browser using MSAL's loopback redirect (authorization code flow with
   PKCE), which listens on a random `localhost` port. Entra ignores the port for `http://localhost` redirect
   URIs on public clients, so no port number is needed.
4. Open **API permissions → Add a permission → Microsoft Graph → Delegated permissions** and add the permissions
   in the table below. You can remove the default `User.Read` only if you add it back; Sleam needs it.
5. Optional: Under **Authentication**, you don't need to enable "Allow public client flows"; Sleam doesn't
   use device code or username/password flows.
6. Click **Grant admin consent for [your organization]** and confirm. All rows should show a green check.
7. From the **Overview** page, send the requester the **Application (client) ID** and **Directory (tenant) ID**.

### Permissions

All permissions are **delegated**: Sleam acts as the signed-in user and can only reach data that user can
already reach in Teams. There are no application (app-only) permissions.

| Permission | What Sleam uses it for | Admin consent required by Microsoft |
|---|---|---|
| `User.Read` | Reading the signed-in user's name and ID | No |
| `Team.ReadBasic.All` | Listing the teams the user belongs to | No |
| `Channel.ReadBasic.All` | Listing channels in those teams | No |
| `ChannelMessage.Send` | Posting channel messages and thread replies | No |
| `Chat.ReadWrite` | Reading and sending 1:1, group and meeting chats, starting new chats, and marking chats as read | No |
| `User.ReadBasic.All` | Searching the directory by name or email (only names, emails and IDs) to start a chat or @-mention someone | No |
| `ChannelMessage.Read.All` | Reading channel messages, finding @-mentions and showing unread channels | **Yes** |
| `Channel.Create` *(optional)* | Creating standard and private channels in the user's teams | **Yes** |

`Channel.Create` is optional. Sleam only requests it when someone creates a channel; without it, everything
else works and channels can still be created in Teams. Team settings that stop members from creating channels
still apply.

Even for permissions that don't require admin consent, granting consent tenant-wide means users won't see a
consent prompt, and it works in tenants where user consent is turned off.

### Limiting and revoking access

- **Limit who can use it:** In **Enterprise applications → Sleam → Properties**, set **Assignment required**
  to **Yes**, then add the allowed users or groups under **Users and groups**.
- **Revoke a user's sessions:** Revoke the user's sessions in Entra, or remove them from the assignment list.
- **Turn it off for everyone:** Set **Enabled for users to sign in** to **No** in the enterprise application,
  or delete the app registration.
- **Conditional Access** policies (MFA, compliant device, location) apply to Sleam sign-ins like any other
  app, because users sign in through Microsoft's own sign-in page.

## Security and privacy details

**Where does data go?** Sleam runs entirely on the user's Mac. It connects only to Microsoft endpoints:
`login.microsoftonline.com` for sign-in and `graph.microsoft.com` for Teams data. There is no Sleam server,
no telemetry, no analytics and no third-party services. Messages are not copied anywhere outside Microsoft 365
except to display them, with the local exceptions listed below.

**What is stored on the Mac?** Everything lives in `~/Library/Application Support/Sleam`:

| Data | Protection |
|---|---|
| Microsoft sign-in tokens (MSAL cache) | Encrypted with a key held in the macOS keychain (Electron `safeStorage`) |
| Mentions index: the last 90 days of @-mentions, each with a short excerpt of the message, the author's name and the conversation name | Plain file, readable by the user's account; protected by FileVault if enabled |
| Read/unread markers for channels (timestamps only) | Plain file |

Signing out deletes the token cache. Deleting the folder removes everything.

**What can it do on the user's behalf?** Read the user's teams, channels, channel messages and chats; send
channel messages, replies and chat messages; start 1:1 and group chats; mark chats as read; look up coworkers'
names and email addresses in the directory; and, only if `Channel.Create` is granted, create channels in teams
the user belongs to. It can't create or delete teams, delete channels, change team membership, read other users' data the user can't see, or access email, files or calendars.

**How often does it call Graph?** Sleam polls, because Graph change notifications need a public server. It
checks recent chats every 15 seconds, recently active channels every 15 seconds, the current team's channels
every minute and other channels every 5 minutes. It uses delta queries where possible and backs off
automatically when Graph throttles it.

**Who makes it?** Sleam is an independent open-source project under the MIT license. It isn't affiliated
with or endorsed by Microsoft or Slack. The full source is available for review.

**Is the app signed?** Not yet. Current builds are built from source and aren't signed or notarized by Apple.
If your organization requires signed apps, the build can be signed with your own Apple Developer ID.
