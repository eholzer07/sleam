import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react'
import { SIGN_IN_REQUIRED } from '../../../shared/api'

export const SIGN_IN_REQUIRED_EVENT = 'sleam:sign-in-required'

/** Turns an IPC rejection into the message thrown in the main process. */
export function errorText(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err)
  return text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

/**
 * Loads data now and again every `intervalMs` while the window is visible.
 * Results from a previous set of `deps` are ignored once deps change.
 */
export function usePolling<T>(load: () => Promise<T>, intervalMs: number, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loadRef = useRef(load)
  loadRef.current = load
  const generation = useRef(0)

  const run = useCallback(async (gen: number) => {
    try {
      const result = await loadRef.current()
      if (gen !== generation.current) return
      setData(result)
      setError(null)
    } catch (err) {
      if (gen !== generation.current) return
      const text = errorText(err)
      if (text.includes(SIGN_IN_REQUIRED)) window.dispatchEvent(new Event(SIGN_IN_REQUIRED_EVENT))
      setError(text)
    }
  }, [])

  useEffect(() => {
    const gen = ++generation.current
    setData(null)
    setError(null)
    run(gen)
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') run(gen)
    }, intervalMs)
    return () => clearInterval(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  const refresh = useCallback(() => run(generation.current), [run])

  return { data, error, refresh, setData }
}
