import '@testing-library/jest-dom/vitest'

// React 19 handles concurrent rendering internally; the act() warning is a false positive.
// See https://react.dev/blog/2024/04/25/react-19#testing-with-act
const originalError = console.error
console.error = (...args) => {
  const msg = args.join('')
  if (msg.includes('was not wrapped in act')) return
  originalError(...args)
}
