export interface GoogleConfig {
  clientId: string
}

export const SCOPE = 'https://www.googleapis.com/auth/drive.file'

export function loadConfig(): GoogleConfig {
  const clientId = import.meta.env['VITE_GOOGLE_CLIENT_ID']
  if (!clientId) {
    throw new Error('Missing VITE_GOOGLE_CLIENT_ID. Copy .env.example to .env and fill it in.')
  }
  return { clientId }
}
