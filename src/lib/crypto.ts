// ─── WhisperBox Crypto Layer ───────────────────────────────────────────────────
// Implements the hybrid RSA-OAEP + AES-GCM scheme required by the API.
// Private keys NEVER leave memory in plaintext.

const BASE_URL = 'https://whisperbox.koyeb.app';

// ─── Utilities ─────────────────────────────────────────────────────────────────

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ─── Key Generation ────────────────────────────────────────────────────────────

/** Generate RSA-OAEP 2048-bit keypair for asymmetric encryption */
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    {
      name: 'RSA-OAEP',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true, // extractable
    ['encrypt', 'decrypt']
  );
}

/** Generate a random 128-bit salt for PBKDF2 */
export function generateSalt(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(16));
}

/** Derive an AES-KW wrapping key from a password + salt using PBKDF2 */
export async function deriveWrappingKey(
  password: string,
  salt: ArrayBuffer
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations: 310_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-KW', length: 256 },
    false,
    ['wrapKey', 'unwrapKey']
  );
}

/** Wrap (encrypt) the RSA private key with an AES-KW wrapping key */
export async function wrapPrivateKey(
  privateKey: CryptoKey,
  wrappingKey: CryptoKey
): Promise<ArrayBuffer> {
  return crypto.subtle.wrapKey('pkcs8', privateKey, wrappingKey, 'AES-KW');
}

/** Unwrap (decrypt) the RSA private key */
export async function unwrapPrivateKey(
  wrappedKey: ArrayBuffer,
  wrappingKey: CryptoKey
): Promise<CryptoKey> {
  return crypto.subtle.unwrapKey(
    'pkcs8',
    wrappedKey,
    wrappingKey,
    'AES-KW',
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  );
}

/** Export RSA public key to base64 (SPKI format) */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
  const exported = await crypto.subtle.exportKey('spki', publicKey);
  return bufferToBase64(exported);
}

/** Import a base64 RSA public key for encryption */
export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
  const keyBuffer = base64ToBuffer(base64Key);
  return crypto.subtle.importKey(
    'spki',
    keyBuffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );
}

// ─── Registration Crypto ───────────────────────────────────────────────────────

export interface RegistrationKeys {
  publicKeyB64: string;
  wrappedPrivateKeyB64: string;
  pbkdf2SaltB64: string;
  privateKey: CryptoKey; // stays in memory
  publicKey: CryptoKey;
}

export async function prepareRegistrationKeys(password: string): Promise<RegistrationKeys> {
  const keyPair = await generateRSAKeyPair();
  const salt = generateSalt();
  const wrappingKey = await deriveWrappingKey(password, salt.buffer);
  const wrappedPrivateKey = await wrapPrivateKey(keyPair.privateKey, wrappingKey);
  const publicKeyB64 = await exportPublicKey(keyPair.publicKey);

  return {
    publicKeyB64,
    wrappedPrivateKeyB64: bufferToBase64(wrappedPrivateKey),
    pbkdf2SaltB64: bufferToBase64(salt.buffer),
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
  };
}

// ─── Login Crypto ──────────────────────────────────────────────────────────────

export async function restorePrivateKey(
  wrappedPrivateKeyB64: string,
  pbkdf2SaltB64: string,
  password: string
): Promise<CryptoKey> {
  const wrappedBuffer = base64ToBuffer(wrappedPrivateKeyB64);
  const saltBuffer = base64ToBuffer(pbkdf2SaltB64);
  const wrappingKey = await deriveWrappingKey(password, saltBuffer);
  return unwrapPrivateKey(wrappedBuffer, wrappingKey);
}

// ─── Message Encryption ────────────────────────────────────────────────────────

export interface EncryptedPayload {
  ciphertext: string;
  iv: string;
  encryptedKey: string;
  encryptedKeyForSelf: string;
}

export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyB64: string,
  senderPublicKey: CryptoKey
): Promise<EncryptedPayload> {
  const encoder = new TextEncoder();

  // 1. Generate random AES-GCM 256-bit key and 96-bit IV
  const aesKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));

  // 2. Encrypt plaintext with AES-GCM
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    encoder.encode(plaintext)
  );

  // 3. Export raw AES key for RSA wrapping
  const rawAesKey = await crypto.subtle.exportKey('raw', aesKey);

  // 4. Encrypt AES key with recipient's RSA public key
  const recipientPublicKey = await importPublicKey(recipientPublicKeyB64);
  const encryptedKeyBuffer = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    recipientPublicKey,
    rawAesKey
  );

  // 5. Encrypt AES key with sender's own RSA public key (for self-read)
  const encryptedKeyForSelfBuffer = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    senderPublicKey,
    rawAesKey
  );

  return {
    ciphertext: bufferToBase64(ciphertextBuffer),
    iv: bufferToBase64(iv.buffer),
    encryptedKey: bufferToBase64(encryptedKeyBuffer),
    encryptedKeyForSelf: bufferToBase64(encryptedKeyForSelfBuffer),
  };
}

// ─── Message Decryption ────────────────────────────────────────────────────────

export async function decryptMessage(
  payload: EncryptedPayload,
  privateKey: CryptoKey,
  isSender: boolean
): Promise<string> {
  // Choose the correct encrypted AES key
  const encryptedKeyB64 = isSender ? payload.encryptedKeyForSelf : payload.encryptedKey;

  // 1. Decrypt AES key with RSA private key
  const encryptedKeyBuffer = base64ToBuffer(encryptedKeyB64);
  const rawAesKey = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedKeyBuffer
  );

  // 2. Import the decrypted AES key
  const aesKey = await crypto.subtle.importKey(
    'raw',
    rawAesKey,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );

  // 3. Decrypt ciphertext
  const ciphertextBuffer = base64ToBuffer(payload.ciphertext);
  const ivBuffer = base64ToBuffer(payload.iv);
  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: new Uint8Array(ivBuffer) },
    aesKey,
    ciphertextBuffer
  );

  return new TextDecoder().decode(plaintextBuffer);
}

// ─── API Client ────────────────────────────────────────────────────────────────

async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(rest.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...rest, headers });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  register: (body: {
    username: string;
    display_name: string;
    password: string;
    public_key: string;
    wrapped_private_key: string;
    pbkdf2_salt: string;
  }) => apiFetch<import('../types').AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (body: { username: string; password: string }) =>
    apiFetch<import('../types').AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),

  me: (token: string) =>
    apiFetch<import('../types').UserProfile>('/auth/me', { token }),

  refresh: (refresh_token: string) =>
    apiFetch<{ access_token: string; token_type: string; expires_in: number }>(
      '/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refresh_token }) }
    ),

  logout: (token: string, refresh_token: string) =>
    apiFetch<{ detail: string }>('/auth/logout', {
      method: 'POST',
      token,
      body: JSON.stringify({ refresh_token }),
    }),

  searchUsers: (token: string, q: string) =>
    apiFetch<import('../types').SearchUser[]>(`/users/search?q=${encodeURIComponent(q)}`, { token }),

  getPublicKey: (token: string, userId: string) =>
    apiFetch<{ public_key: string }>(`/users/${userId}/public-key`, { token }),

  getConversations: (token: string) =>
    apiFetch<import('../types').ConversationSummary[]>('/conversations', { token }),

  getMessages: (token: string, userId: string, params?: { limit?: number; before?: string }) => {
    const qs = new URLSearchParams();
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.before) qs.set('before', params.before);
    return apiFetch<import('../types').MessageResponse[]>(
      `/conversations/${userId}/messages${qs.toString() ? '?' + qs : ''}`,
      { token }
    );
  },

  sendMessage: (token: string, body: { to: string; payload: import('../types').MessagePayload }) =>
    apiFetch<import('../types').MessageResponse>('/messages', {
      method: 'POST',
      token,
      body: JSON.stringify(body),
    }),
};
