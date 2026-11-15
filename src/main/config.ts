import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export interface StoredConfig {
  clientId?: string
  tenantId?: string
  demo?: boolean
}

const configPath = (): string => join(app.getPath('userData'), 'config.json')

export function loadConfig(): StoredConfig {
  let stored: StoredConfig = {}
  try {
    stored = JSON.parse(readFileSync(configPath(), 'utf8'))
  } catch {
    // First run, or an unreadable file: fall back to defaults.
  }
  return {
    ...stored,
    clientId: stored.clientId || process.env.SLEAM_CLIENT_ID,
    tenantId: stored.tenantId || process.env.SLEAM_TENANT_ID
  }
}

export function saveConfig(config: StoredConfig): void {
  writeFileSync(configPath(), JSON.stringify(config, null, 2))
}
