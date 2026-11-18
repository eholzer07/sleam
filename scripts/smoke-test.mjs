// Launches a packaged build, opens the demo workspace and checks a few platform-specific behaviors.
// Usage: node scripts/smoke-test.mjs <path to the app executable> <screenshot folder>
// Needs playwright-core (installed by the CI workflow, not a project dependency).
import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [executablePath, shots = '.'] = process.argv.slice(2)
const isLinux = process.platform === 'linux'

const app = await electron.launch({
  executablePath,
  // CI runners block Chromium's sandbox (Ubuntu 24.04 AppArmor); installed .deb builds get a profile instead.
  args: [...(isLinux ? ['--no-sandbox'] : []), `--user-data-dir=${mkdtempSync(join(tmpdir(), 'sleam-smoke-'))}`]
})
const fail = async (message) => {
  console.error(`FAIL: ${message}`)
  await app.close()
  process.exit(1)
}

const page = await app.firstWindow()
await page.waitForSelector('text=Explore the demo workspace', { timeout: 30_000 })
if (isLinux) {
  // A CI runner has no GNOME Keyring or KWallet, so Sleam must refuse to save tokens and say so.
  if (!(await page.isVisible('text=Sleam won’t save your sign-in'))) await fail('no-password-store notice missing')
  if (await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isMenuBarVisible()))
    await fail('menu bar should be hidden until Alt is pressed')
}
await page.screenshot({ path: join(shots, 'signin.png') })

await page.click('text=Explore the demo workspace')
await page.waitForSelector('.topbar', { timeout: 30_000 })
const platform = await page.evaluate(() => document.documentElement.dataset.platform)
if (platform !== (process.platform === 'darwin' ? 'mac' : 'other')) await fail(`data-platform is ${platform}`)

await page.keyboard.press(process.platform === 'darwin' ? 'Meta+N' : 'Control+N')
await page.waitForSelector('#new-message-title', { timeout: 5_000 }).catch(() => fail('new-message shortcut did nothing'))
await page.screenshot({ path: join(shots, 'workspace.png') })

console.log(`OK: ${await app.evaluate(({ app }) => `${app.getName()} ${app.getVersion()}`)} on ${process.platform}`)
await app.close()
