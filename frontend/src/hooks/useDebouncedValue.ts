import { useEffect, useState } from 'react'

// Returns `value` once it has stopped changing for `delayMs`. Typing "sofia" fires one search, not five.
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    // The cleanup runs before the next effect, so every keystroke cancels the previous timer.
    return () => clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}
