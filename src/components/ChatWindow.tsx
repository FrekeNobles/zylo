import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Shield, Lock, ChevronUp, AlertTriangle } from 'lucide-react';
import { format, isToday, isYesterday } from 'date-fns';
import { useStore } from '../lib/store';
import { api, encryptMessage, decryptMessage } from '../lib/crypto';
import { useWebSocket } from '../hooks/useWebSocket';
import type { DecryptedMessage } from '../types';

interface ChatWindowProps {
  recipientId: string;
  recipientUser: { id: string; username: string; display_name: string };
}

function formatMessageTime(dateStr: string): string {
  const d = new Date(dateStr);
  if (isToday(d)) return format(d, 'HH:mm');
  if (isYesterday(d)) return `Yesterday ${format(d, 'HH:mm')}`;
  return format(d, 'MMM d, HH:mm');
}

function groupByDate(messages: DecryptedMessage[]): { label: string; messages: DecryptedMessage[] }[] {
  const groups: Map<string, DecryptedMessage[]> = new Map();
  // Messages are newest first, reverse for display
  const sorted = [...messages].reverse();
  for (const msg of sorted) {
    const d = new Date(msg.created_at);
    const key = isToday(d) ? 'Today' : isYesterday(d) ? 'Yesterday' : format(d, 'MMMM d, yyyy');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(msg);
  }
  return Array.from(groups.entries()).map(([label, messages]) => ({ label, messages }));
}

export default function ChatWindow({ recipientId, recipientUser }: ChatWindowProps) {
  const { user, accessToken, cryptoSession, messages, onlineUsers, setMessages, prependMessages } = useStore();
  const { sendViaWebSocket } = useWebSocket();

  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [encryptionInfo, setEncryptionInfo] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const conversationMessages = messages[recipientId] || [];
  const isOnline = onlineUsers.has(recipientId);

  const loadHistory = useCallback(
    async (before?: string) => {
      if (!accessToken || !cryptoSession || !user) return;
      setLoadingHistory(true);
      try {
        const raw = await api.getMessages(accessToken, recipientId, { limit: 30, before });
        if (raw.length < 30) setHasMore(false);

        const decrypted: DecryptedMessage[] = await Promise.all(
          raw.map(async (msg) => {
            const isSender = msg.from_user_id === user.id;
            try {
              const text = await decryptMessage(msg.payload, cryptoSession.privateKey, isSender);
              return { id: msg.id, from_user_id: msg.from_user_id, to_user_id: msg.to_user_id, text, created_at: msg.created_at };
            } catch {
              return { id: msg.id, from_user_id: msg.from_user_id, to_user_id: msg.to_user_id, text: '[Decryption failed]', created_at: msg.created_at, decryptionFailed: true };
            }
          })
        );

        if (!before) {
          setMessages(recipientId, decrypted);
        } else {
          prependMessages(recipientId, decrypted);
        }
      } catch {
        // ignore
      } finally {
        setLoadingHistory(false);
      }
    },
    [accessToken, cryptoSession, user, recipientId, setMessages, prependMessages]
  );

  // Load history on conversation change
  useEffect(() => {
    setHasMore(true);
    loadHistory();
    setTimeout(() => bottomRef.current?.scrollIntoView(), 100);
  }, [recipientId]); // eslint-disable-line

  // Scroll to bottom on new messages from WS
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [conversationMessages.length]);

  const handleLoadMore = () => {
    const oldest = conversationMessages[conversationMessages.length - 1];
    if (oldest) loadHistory(oldest.created_at);
  };

  const handleSend = async () => {
    if (!input.trim() || !accessToken || !cryptoSession || !user || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    try {
      const recipientKeyData = await api.getPublicKey(accessToken, recipientId);
      const payload = await encryptMessage(text, recipientKeyData.public_key, cryptoSession.publicKey);

      // Try WebSocket first
      const sent = sendViaWebSocket(recipientId, payload);

      if (!sent) {
        // Fallback to REST
        await api.sendMessage(accessToken, { to: recipientId, payload });
      }

      // Optimistically add to local state
      const tempMsg: DecryptedMessage = {
        id: `temp-${Date.now()}`,
        from_user_id: user.id,
        to_user_id: recipientId,
        text,
        created_at: new Date().toISOString(),
      };
      useStore.getState().addMessage(recipientId, tempMsg);
      useStore.getState().updateConversationTimestamp(recipientId, tempMsg.created_at, recipientUser);
    } catch (err) {
      setInput(text); // restore input on failure
      console.error('[Zylo] Send failed:', err);
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const grouped = groupByDate(conversationMessages);

  return (
    <div className="flex flex-col flex-1 h-full min-w-0">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-800 bg-zinc-900 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm font-semibold">
              {recipientUser.display_name.charAt(0).toUpperCase()}
            </div>
            {isOnline && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-900" />
            )}
          </div>
          <div>
            <p className="text-white font-semibold text-sm">{recipientUser.display_name}</p>
            <p className="text-zinc-500 text-xs font-mono">
              @{recipientUser.username}
              {isOnline ? (
                <span className="ml-2 text-emerald-500">online</span>
              ) : (
                <span className="ml-2 text-zinc-600">offline</span>
              )}
            </p>
          </div>
        </div>
        <button
          onClick={() => setEncryptionInfo((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-mono transition-all ${
            encryptionInfo
              ? 'bg-purple-900/40 border-purple-700 text-purple-400'
              : 'bg-zinc-800 border-zinc-700 text-zinc-500 hover:text-zinc-300'
          }`}
        >
          <Lock size={11} />
          E2EE
        </button>
      </div>

      {/* Encryption info panel */}
      {encryptionInfo && (
        <div className="bg-purple-950/30 border-b border-purple-900/30 px-6 py-3 animate-fade-in">
          <div className="flex items-start gap-2">
            <Shield size={14} className="text-purple-400 mt-0.5 shrink-0" />
            <div className="text-xs text-purple-300 space-y-0.5">
              <p className="font-medium">End-to-end encrypted with RSA-OAEP + AES-GCM-256</p>
              <p className="text-purple-400/70">
                Messages are encrypted on your device before sending. The server only stores ciphertext — it cannot read your messages. Your private key never leaves this browser.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1 flex flex-col">
        {/* Load more */}
        {hasMore && conversationMessages.length > 0 && (
          <button
            onClick={handleLoadMore}
            disabled={loadingHistory}
            className="self-center flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-400 text-xs transition-all mb-2 disabled:opacity-50"
          >
            <ChevronUp size={13} />
            {loadingHistory ? 'Loading...' : 'Load earlier messages'}
          </button>
        )}

        {loadingHistory && conversationMessages.length === 0 && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-5 h-5 border-2 border-purple-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-zinc-600 text-sm">Decrypting messages...</p>
            </div>
          </div>
        )}

        {!loadingHistory && conversationMessages.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
            <div className="w-12 h-12 rounded-2xl bg-zinc-800 flex items-center justify-center">
              <Shield size={22} className="text-purple-500" />
            </div>
            <div>
              <p className="text-zinc-300 font-medium text-sm">No messages yet</p>
              <p className="text-zinc-600 text-xs mt-1">
                Your conversation is end-to-end encrypted.
              </p>
            </div>
          </div>
        )}

        {grouped.map(({ label, messages: group }) => (
          <div key={label}>
            {/* Date separator */}
            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-zinc-800" />
              <span className="text-zinc-600 text-xs px-2">{label}</span>
              <div className="flex-1 h-px bg-zinc-800" />
            </div>

            {group.map((msg) => {
              const isMine = msg.from_user_id === user?.id;
              return (
                <div
                  key={msg.id}
                  className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-1 animate-fade-in`}
                >
                  <div
                    className={`max-w-xs lg:max-w-md xl:max-w-lg px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      isMine
                        ? 'bg-purple-600 text-white rounded-br-sm'
                        : 'bg-zinc-800 text-zinc-100 rounded-bl-sm'
                    } ${msg.decryptionFailed ? 'opacity-60' : ''}`}
                  >
                    {msg.decryptionFailed && (
                      <div className="flex items-center gap-1 mb-1">
                        <AlertTriangle size={11} className="text-yellow-500" />
                        <span className="text-yellow-500 text-xs">Decryption failed</span>
                      </div>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                    <p
                      className={`text-xs mt-1 ${
                        isMine ? 'text-purple-200/70' : 'text-zinc-600'
                      }`}
                    >
                      {formatMessageTime(msg.created_at)}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-4 border-t border-zinc-800 bg-zinc-900 shrink-0">
        <div className="flex items-end gap-3">
          <div className="flex-1 bg-zinc-800 border border-zinc-700 rounded-2xl px-4 py-3 focus-within:border-purple-500 focus-within:ring-1 focus-within:ring-purple-500/20 transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Message — encrypted before sending"
              rows={1}
              className="w-full bg-transparent text-white placeholder-zinc-600 text-sm resize-none focus:outline-none leading-relaxed"
              style={{ maxHeight: '120px' }}
            />
          </div>
          <button
            onClick={handleSend}
            disabled={!input.trim() || sending}
            className="w-11 h-11 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 disabled:text-zinc-600 text-white flex items-center justify-center transition-all shrink-0"
          >
            {sending ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Send size={15} />
            )}
          </button>
        </div>
        <div className="flex items-center gap-1 mt-2 px-1">
          <Lock size={10} className="text-zinc-700" />
          <span className="text-zinc-700 text-xs">Enter to send · Shift+Enter for newline</span>
        </div>
      </div>
    </div>
  );
}
