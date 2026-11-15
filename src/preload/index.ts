import { contextBridge, ipcRenderer } from 'electron'
import { API_METHODS } from '../shared/api'

const api = Object.fromEntries(
  API_METHODS.map((name) => [name, (...args: unknown[]) => ipcRenderer.invoke(`sleam:${name}`, ...args)])
)

contextBridge.exposeInMainWorld('sleam', api)
