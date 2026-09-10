// The session is the refresh token itself, encrypted, carried in the cookie.
//
// The obvious design keys a database row by a session id. This avoids the
// database entirely: the Worker holds one key, the cookie holds the ciphertext,
// and there is nothing to store, back up or migrate. The trade is that
// rotating the key signs everyone out and there is no server-side revocation
// of a single user — both acceptable until they aren't, and both a KV binding
// away when that day comes.

const IV_BYTES = 12

function base64urlEncode(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlDecode(text: string): Uint8Array {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, '='))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

// The secret is an arbitrary string, so it is hashed to the exact 256 bits
// AES-GCM wants rather than constraining what the operator may choose.
async function importKey(secret: string): Promise<CryptoKey> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret))
  return crypto.subtle.importKey('raw', digest, { name: 'AES-GCM' }, false, [
    'encrypt',
    'decrypt',
  ])
}

export async function seal(plaintext: string, secret: string): Promise<string> {
  const key = await importKey(secret)
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(plaintext),
  )
  const packed = new Uint8Array(IV_BYTES + ciphertext.byteLength)
  packed.set(iv)
  packed.set(new Uint8Array(ciphertext), IV_BYTES)
  return base64urlEncode(packed)
}

/**
 * Returns null for anything that does not decrypt: a tampered cookie, one
 * sealed under a rotated key, or plain garbage. A bad cookie is not an
 * exceptional condition — it is a signed-out user, and the caller treats it
 * as one.
 */
export async function unseal(sealed: string, secret: string): Promise<string | null> {
  try {
    const packed = base64urlDecode(sealed)
    if (packed.length <= IV_BYTES) return null
    const key = await importKey(secret)
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: packed.slice(0, IV_BYTES) },
      key,
      packed.slice(IV_BYTES),
    )
    return new TextDecoder().decode(plaintext)
  } catch {
    return null
  }
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0) continue
    if (part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return null
}

export function setCookie(
  name: string,
  value: string,
  options: { maxAge: number },
): string {
  // SameSite=Lax so the cookie survives Google's redirect back to /auth/callback,
  // which is a cross-site top-level navigation. HttpOnly keeps it out of reach
  // of any script, so an XSS bug cannot exfiltrate the refresh token.
  return [
    `${name}=${value}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${options.maxAge}`,
  ].join('; ')
}

export function clearCookie(name: string): string {
  return setCookie(name, '', { maxAge: 0 })
}

export function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return base64urlEncode(bytes)
}
