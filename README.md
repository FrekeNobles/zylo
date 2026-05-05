# Zylo — End-to-End Encrypted Messaging

> A secure messaging platform built on the WhisperBox API. The server never sees plaintext.

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ZYLO CLIENT (Browser)                        │
│                                                                       │
│  ┌──────────────┐    ┌──────────────────┐    ┌────────────────────┐  │
│  │  Auth Page   │    │   Chat Window    │    │     Sidebar        │  │
│  │  (Register/  │    │  (Encrypt before │    │  (Conversations,   │  │
│  │   Login)     │    │   send, decrypt  │    │   User search)     │  │
│  └──────┬───────┘    │   on receive)    │    └────────────────────┘  │
│         │            └────────┬─────────┘                             │
│         ▼                     ▼                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                    crypto.ts (Web Crypto API)                    │  │
│  │                                                                   │  │
│  │  generateRSAKeyPair()   encryptMessage()   decryptMessage()      │  │
│  │  prepareRegistrationKeys()  restorePrivateKey()                  │  │
│  │  deriveWrappingKey() (PBKDF2) → wrapPrivateKey() (AES-KW)       │  │
│  └────────────────────────────────┬────────────────────────────────┘  │
│                                   │                                    │
│  ┌────────────────────────────────▼────────────────────────────────┐  │
│  │                    Zustand Store (in-memory)                      │  │
│  │  { privateKey (CryptoKey), publicKey, accessToken, messages }    │  │
│  └────────────────────────────────┬────────────────────────────────┘  │
│                                   │                                    │
└───────────────────────────────────┼────────────────────────────────────┘
                                    │
              ┌─────────────────────┴────────────────────┐
              │                                          │
              ▼                                          ▼
   ┌─────────────────────┐                ┌─────────────────────────┐
   │  REST API           │                │  WebSocket              │
   │  POST /auth/...     │                │  wss://whisperbox...    │
   │  GET  /users/...    │                │  message.send           │
   │  GET  /conversations│                │  message.receive        │
   │  POST /messages     │                │  user.online/offline    │
   └──────────┬──────────┘                └────────────┬────────────┘
              │                                        │
              └──────────────┬─────────────────────────┘
                             ▼
              ┌──────────────────────────────────────┐
              │     WhisperBox Backend               │
              │   Stores ONLY encrypted blobs        │
              │   Never sees plaintext               │
              └──────────────────────────────────────┘
```

---

## Encryption Flow

### Registration
```
1. Client generates RSA-OAEP 2048-bit keypair (browser WebCrypto)
2. Client generates random 128-bit PBKDF2 salt
3. Client derives AES-KW wrapping key from (password + salt) via PBKDF2 (310,000 iterations, SHA-256)
4. Client wraps (encrypts) RSA private key with AES-KW → wrapped_private_key (base64)
5. Client exports RSA public key → public_key (base64, SPKI format)
6. Server receives: username, display_name, public_key, wrapped_private_key, pbkdf2_salt
7. Server stores blobs verbatim — never has access to private key
```

### Login / Session Restore
```
1. POST /auth/login returns { wrapped_private_key, pbkdf2_salt, access_token, ... }
2. Client re-derives AES-KW wrapping key from (entered password + pbkdf2_salt)
3. Client unwraps RSA private key into memory (CryptoKey object, non-extractable after import)
4. Private key lives only in browser memory — never written to disk
```

### Sending a Message
```
1. Fetch recipient's RSA public key from GET /users/{id}/public-key
2. Generate random 256-bit AES-GCM key + 96-bit IV (per-message, never reused)
3. Encrypt plaintext → ciphertext (AES-GCM)
4. Encrypt AES key with recipient RSA public key → encryptedKey
5. Encrypt AES key with sender's own RSA public key → encryptedKeyForSelf
6. Send { ciphertext, iv, encryptedKey, encryptedKeyForSelf } via WebSocket or REST
7. Server stores the 4-field payload — cannot decrypt any of it
```

### Receiving a Message
```
1. WebSocket delivers message.receive frame with encrypted payload
2. Client decrypts encryptedKey using own RSA private key → raw AES-GCM key
3. Client decrypts ciphertext with AES-GCM key + iv → plaintext
4. Decrypted text is displayed — never stored in encrypted form on client
```

---

## Key Management

| Key | Generation | Storage | Lifetime |
|-----|-----------|---------|---------|
| RSA private key | WebCrypto `generateKey` | Memory only (CryptoKey) | Session |
| RSA public key | Derived from keypair | Backend (base64) | Permanent |
| AES-KW wrapping key | PBKDF2 from password | Memory only | Session |
| Per-message AES-GCM key | `generateKey` per message | Never stored | Message |
| PBKDF2 salt | `getRandomValues` | Backend (base64) | Permanent |

### Private Key Security
- Generated exclusively in the browser via `window.crypto.subtle`
- Wrapped with AES-KW (256-bit) derived from user's password via PBKDF2
- The wrapped (encrypted) blob is stored on the server — useless without the password
- The unwrapped `CryptoKey` object lives in JS heap only — cannot be serialised
- Never written to `localStorage`, `sessionStorage`, `IndexedDB`, or any persistent storage

---

## Security Trade-offs & Known Limitations

### Trade-offs
| Decision | Benefit | Cost |
|----------|---------|------|
| Password-derived key wrap | No separate key backup needed | Password strength determines key security |
| RSA-2048 | Wide browser support, simple API | Larger ciphertext than ECDH; no perfect forward secrecy |
| Per-message AES-GCM key | Simple; no session state needed | Larger message payload vs. session keys |
| In-memory private key | Never hits disk | Lost on tab close; re-login required |

### Known Limitations
1. **No forward secrecy** — Compromising the RSA private key exposes all past messages encrypted to that key. A full ECDH + Signal Double Ratchet would provide PFS but is significantly more complex.
2. **Password as root of trust** — A weak password means a weak key. Consider adding a client-side password strength requirement.
3. **No key rotation** — Users cannot rotate their keypair without losing access to old messages.
4. **Single device** — The private key cannot be shared across devices without exporting it (which would require encrypting it again for the new device).
5. **Metadata visible to server** — The server knows who is messaging whom, when, and message sizes — only content is hidden.
6. **No message deletion** — The API does not expose a delete endpoint; old ciphertext persists on the server.
7. **Replay attacks** — AES-GCM nonces are random; the server does not validate uniqueness. A message captured and replayed by the server would be decrypted again by the client.

---

## Tech Stack

- **React 18** + **TypeScript** — UI framework
- **Zustand** — lightweight client state management
- **Tailwind CSS** — utility-first styling
- **Vite** — build tool
- **Web Crypto API** — browser-native encryption (no third-party crypto libraries)
- **date-fns** — date formatting
- **lucide-react** — icons

---

## Running Locally

```bash
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## File Structure

```
zylo/
├── src/
│   ├── lib/
│   │   ├── crypto.ts      # All crypto ops + API client
│   │   └── store.ts       # Zustand global state
│   ├── hooks/
│   │   └── useWebSocket.ts # WS connection + token refresh
│   ├── components/
│   │   ├── Sidebar.tsx    # Conversation list + user search
│   │   └── ChatWindow.tsx # Message display + input
│   ├── pages/
│   │   ├── AuthPage.tsx   # Login / Register
│   │   └── AppPage.tsx    # Main layout
│   ├── types/
│   │   └── index.ts       # TypeScript types (matches API schema)
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── index.html
├── package.json
├── tailwind.config.js
├── vite.config.ts
└── README.md
```
