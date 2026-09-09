export interface GoogleConfig {
  clientId: string
  apiKey: string
}

export const SCOPE = 'https://www.googleapis.com/auth/drive.file'

export function loadConfig(): GoogleConfig {
  const clientId = import.meta.env['VITE_GOOGLE_CLIENT_ID']
  const apiKey = import.meta.env['VITE_GOOGLE_API_KEY']
  if (!clientId || !apiKey) {
    throw new Error(
      'Missing VITE_GOOGLE_CLIENT_ID or VITE_GOOGLE_API_KEY. Copy .env.example to .env and fill it in.',
    )
  }
  return { clientId, apiKey }
}
