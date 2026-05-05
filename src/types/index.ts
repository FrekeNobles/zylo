// ─── API Types (matching WhisperBox schema exactly) ───────────────────────────

export interface UserProfile {
  id: string;
  username: string;
  display_name: string;
  public_key: string;
  wrapped_private_key: string;
  pbkdf2_salt: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  user: UserProfile;
}

export interface MessagePayload {
  ciphertext: string;
  iv: string;
  encryptedKey: string;
  encryptedKeyForSelf: string;
}

export interface MessageResponse {
  id: string;
  from_user_id: string;
  to_user_id: string;
  payload: MessagePayload;
  delivered: boolean;
  created_at: string;
}

export interface ConversationSummary {
  user_id: string;
  display_name: string;
  username: string;
  last_message_at: string;
}

export interface SearchUser {
  id: string;
  username: string;
  display_name: string;
}

// ─── App State Types ───────────────────────────────────────────────────────────

export interface DecryptedMessage {
  id: string;
  from_user_id: string;
  to_user_id: string;
  text: string;
  created_at: string;
  decryptionFailed?: boolean;
}

export interface CryptoSession {
  privateKey: CryptoKey;
  publicKey: CryptoKey;
}

// ─── WebSocket Event Types ─────────────────────────────────────────────────────

export interface WsMessageReceive {
  event: 'message.receive';
  id: string;
  from_user_id: string;
  to_user_id: string;
  payload: MessagePayload;
  created_at: string;
}

export interface WsUserPresence {
  event: 'user.online' | 'user.offline';
  user_id: string;
}

export interface WsError {
  event: 'error';
  detail: string;
}

export type WsServerEvent = WsMessageReceive | WsUserPresence | WsError;
