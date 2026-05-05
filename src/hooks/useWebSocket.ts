import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '../lib/store';
import { decryptMessage, api } from '../lib/crypto';
import type { WsServerEvent, MessagePayload } from '../types';

const WS_URL = 'wss://whisperbox.koyeb.app/ws';
const REFRESH_INTERVAL_MS = 12 * 60 * 1000; // 12 minutes (tokens expire at 15)

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null);
  const {
    accessToken,
    refreshToken,
    user,
    cryptoSession,
    addMessage,
    setUserOnline,
    updateConversationTimestamp,
    setAccessToken,
  } = useStore();

  const handleIncomingMessage = useCallback(
    async (
      id: string,
      from_user_id: string,
      to_user_id: string,
      payload: MessagePayload,
      created_at: string
    ) => {
      if (!cryptoSession || !user) return;

      const isSender = from_user_id === user.id;
      const conversationPartnerId = isSender ? to_user_id : from_user_id;

      try {
        const text = await decryptMessage(payload, cryptoSession.privateKey, isSender);
        addMessage(conversationPartnerId, {
          id,
          from_user_id,
          to_user_id,
          text,
          created_at,
        });
        updateConversationTimestamp(conversationPartnerId, created_at);
      } catch {
        addMessage(conversationPartnerId, {
          id,
          from_user_id,
          to_user_id,
          text: '[Decryption failed]',
          created_at,
          decryptionFailed: true,
        });
      }
    },
    [cryptoSession, user, addMessage, updateConversationTimestamp]
  );

  const connect = useCallback(() => {
    if (!accessToken || !cryptoSession) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}?token=${accessToken}`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Zylo] WebSocket connected');
    };

    ws.onmessage = async (event) => {
      try {
        const data: WsServerEvent = JSON.parse(event.data);
        if (data.event === 'message.receive') {
          await handleIncomingMessage(
            data.id,
            data.from_user_id,
            data.to_user_id,
            data.payload,
            data.created_at
          );
        } else if (data.event === 'user.online') {
          setUserOnline(data.user_id, true);
        } else if (data.event === 'user.offline') {
          setUserOnline(data.user_id, false);
        }
      } catch {
        // malformed frame — ignore
      }
    };

    ws.onclose = () => {
      console.log('[Zylo] WebSocket closed, reconnecting in 3s...');
      setTimeout(connect, 3000);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [accessToken, cryptoSession, handleIncomingMessage, setUserOnline]);

  // Token refresh loop
  useEffect(() => {
    if (!refreshToken) return;
    const interval = setInterval(async () => {
      try {
        const result = await api.refresh(refreshToken);
        setAccessToken(result.access_token);
      } catch {
        console.error('[Zylo] Token refresh failed');
      }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refreshToken, setAccessToken]);

  useEffect(() => {
    if (!accessToken || !cryptoSession) return;
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [accessToken, cryptoSession, connect]);

  const sendViaWebSocket = useCallback(
    (to: string, payload: MessagePayload): boolean => {
      if (wsRef.current?.readyState !== WebSocket.OPEN) return false;
      wsRef.current.send(
        JSON.stringify({ event: 'message.send', to, payload })
      );
      return true;
    },
    []
  );

  return { sendViaWebSocket, wsRef };
}
