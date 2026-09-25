// Types for our own VITE_* variables, so `import.meta.env.VITE_API_URL` isn't just `any`.
interface ImportMetaEnv {
  readonly VITE_API_URL?: string
  readonly VITE_USE_MOCKS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
