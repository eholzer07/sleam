/// <reference types="vite/client" />
import type { SleamApi } from '../../shared/api'

declare global {
  interface Window {
    sleam: SleamApi
  }
}
