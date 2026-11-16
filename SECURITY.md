# Security policy

Sleam signs in to your work account and reads your Teams messages, so security reports are taken seriously.
Thank you for taking the time to send one.

## Reporting a vulnerability

Please report security problems privately, not in a public issue:

1. Go to the repository's **Security** tab.
2. Click **Report a vulnerability**.
3. Describe the problem, the steps to reproduce it, and what an attacker could do with it.

This is a small volunteer project, so responses are best effort. You can expect:

- an acknowledgement within 7 days
- an initial assessment within 14 days
- a fix or a mitigation plan for confirmed issues as soon as practical, with credit in the release notes if you
  want it

Please give us a reasonable chance to release a fix before you disclose the problem publicly.

## Supported versions

Only the latest release gets security fixes. Sleam updates are not automatic yet, so update to the latest version
before reporting.

## What's in scope

Sleam has no server of its own. It runs on your Mac and talks only to Microsoft (Entra ID for sign-in, Microsoft
Graph for Teams data). Reports about Sleam's own code are in scope, for example:

- **Sign-in tokens:** tokens stored or exposed unencrypted, or leaked to logs, other apps or the network.
- **Message rendering:** message content from Teams that runs script, loads remote content unexpectedly, or
  breaks out of sanitization.
- **App isolation:** ways for page content to reach Node.js, Electron APIs or the main process. Examples are the
  renderer sandbox, the preload bridge, IPC handlers, navigation, and opening external links.
- **Permissions:** Sleam requesting more Microsoft Graph access than a feature needs, or using a permission
  for something other than what's documented in [docs/IT-REQUEST.md](docs/IT-REQUEST.md).
- **Local data:** settings, read markers or the mentions store being readable or writable in ways they
  shouldn't be.

## What's out of scope

- Vulnerabilities in Microsoft Teams, Microsoft Graph or Entra ID themselves. Report those to the
  [Microsoft Security Response Center](https://msrc.microsoft.com/report).
- How a particular organization configured its tenant, such as consent policies or app registrations.
- Attacks that need someone who already controls your Mac or your user account.
- Vulnerabilities in dependencies that have no realistic impact on Sleam. Please do report one that does.
