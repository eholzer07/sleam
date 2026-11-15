# Installing Sleam

Sleam is a desktop app for macOS that shows your Microsoft Teams channels and chats in a Slack-style layout.
It works with your organization's existing Teams; nothing changes for your coworkers.

Setup has three parts:

1. Ask your IT team to approve Sleam for your organization (once per organization).
2. Install the app.
3. Sign in.

## 1. Get approval from IT

Sleam reads and sends Teams messages through Microsoft Graph, Microsoft's official API. Before it can, your
organization needs an **app registration** for it in Microsoft Entra ID (formerly Azure AD). Most organizations
only let IT administrators create one or approve its permissions.

[IT-REQUEST.md](IT-REQUEST.md) has everything to send them:

- a ready-to-send request email
- step-by-step setup instructions for the administrator
- answers to the security questions IT usually asks

When IT is done, they'll send you two values:

- **Application (client) ID**
- **Directory (tenant) ID**

Neither one is a password or secret. You'll paste both into Sleam when you sign in.

> Check your employer's policies before using Sleam for work, and ask IT if you're unsure. Some organizations
> only allow software they've approved.

## 2. Install the app

Sleam doesn't have a downloadable, signed release yet, so for now you build it from source. That takes a few
minutes and needs no programming knowledge beyond pasting commands into Terminal.

1. Install [Node.js](https://nodejs.org) 22.12 or newer (the LTS installer is fine).
2. Download the Sleam source code and open Terminal in its folder.
3. Run:

   ```sh
   npm install
   npx install-electron
   npm run dist:mac
   ```

4. Open the `dist` folder, open the `.dmg` file, and drag **Sleam** into **Applications**.

Because this build isn't signed by an Apple-registered developer, macOS blocks it the first time you open it:

1. Open Sleam from Applications. When macOS says it can't verify the app, click **Done**.
2. Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to the Sleam
   message.
3. Confirm with your password. After that, Sleam opens normally.

## 3. Sign in

1. Open Sleam.
2. Paste the **Application (client) ID** and **Directory (tenant) ID** from IT.
3. Click **Sign in with Microsoft**. Your browser opens to the usual Microsoft sign-in page. Sign in with your work account
   (including multi-factor authentication if your organization uses it).
4. If Microsoft asks you to accept the permissions, accept them. Then switch back to Sleam.

Your teams appear in the left rail, and their channels and your chats appear in the sidebar.

### If something goes wrong

| What you see | What it means |
|---|---|
| "Need admin approval" in the browser | IT hasn't granted consent yet. Point them to step 6 of [IT-REQUEST.md](IT-REQUEST.md#setup-steps-for-the-administrator). |
| Chats work but channels say they need approval | Channel reading (`ChannelMessage.Read.All`) needs admin consent that hasn't been granted. Same fix as above. |
| "AADSTS700016: Application … was not found" | The client ID or tenant ID is wrong. Check the values IT sent. |
| "AADSTS50011: redirect URI mismatch" | The app registration's redirect URI isn't set up as described in step 3 of the admin instructions. |
| The browser sign-in finishes but Sleam doesn't continue | Make sure nothing (like a VPN or firewall tool) blocks connections to `localhost` on your Mac. |

## Signing out and removing Sleam

- To sign out, click your avatar at the bottom left, then **Sign out**. This deletes your saved sign-in.
- To remove everything, quit Sleam, delete it from Applications, and delete
  `~/Library/Application Support/Sleam`.
