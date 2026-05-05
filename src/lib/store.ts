import { create } from 'zustand';
import type { UserProfile, ConversationSummary, DecryptedMessage, CryptoSession } from '../types';

interface AppState {
  // Auth
  accessToken: string | null;
  refreshToken: string | null;
  user: UserProfile | null;
  cryptoSession: CryptoSession | null;

  // UI
  activeConversationUserId: string | null;
  activeConversationUser: { id: string; username: string; display_name: string } | null;
  onlineUsers: Set<string>;

  // Data
  conversations: ConversationSummary[];
  messages: Record<string, DecryptedMessage[]>; // keyed by other user's ID

  // Actions
  setAuth: (
    accessToken: string,
    refreshToken: string,
    user: UserProfile,
    session: CryptoSession
  ) => void;
  setAccessToken: (token: string) => void;
  clearAuth: () => void;
  setActiveConversation: (
    userId: string,
    user: { id: string; username: string; display_name: string } | null
  ) => void;
  setConversations: (conversations: ConversationSummary[]) => void;
  setMessages: (userId: string, messages: DecryptedMessage[]) => void;
  prependMessages: (userId: string, messages: DecryptedMessage[]) => void;
  addMessage: (userId: string, message: DecryptedMessage) => void;
  setUserOnline: (userId: string, online: boolean) => void;
  updateConversationTimestamp: (userId: string, timestamp: string, user?: { username: string; display_name: string }) => void;
}

export const useStore = create<AppState>((set) => ({
  accessToken: null,
  refreshToken: null,
  user: null,
  cryptoSession: null,
  activeConversationUserId: null,
  activeConversationUser: null,
  onlineUsers: new Set(),
  conversations: [],
  messages: {},

  setAuth: (accessToken, refreshToken, user, cryptoSession) =>
    set({ accessToken, refreshToken, user, cryptoSession }),

  setAccessToken: (accessToken) => set({ accessToken }),

  clearAuth: () =>
    set({
      accessToken: null,
      refreshToken: null,
      user: null,
      cryptoSession: null,
      activeConversationUserId: null,
      activeConversationUser: null,
      conversations: [],
      messages: {},
      onlineUsers: new Set(),
    }),

  setActiveConversation: (userId, user) =>
    set({ activeConversationUserId: userId, activeConversationUser: user }),

  setConversations: (conversations) => set({ conversations }),

  setMessages: (userId, messages) =>
    set((state) => ({ messages: { ...state.messages, [userId]: messages } })),

  prependMessages: (userId, older) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [userId]: [...(state.messages[userId] || []), ...older],
      },
    })),

  addMessage: (userId, message) =>
    set((state) => {
      const existing = state.messages[userId] || [];
      // Deduplicate by id
      if (existing.find((m) => m.id === message.id)) return state;
      return {
        messages: {
          ...state.messages,
          [userId]: [message, ...existing],
        },
      };
    }),

  setUserOnline: (userId, online) =>
    set((state) => {
      const next = new Set(state.onlineUsers);
      if (online) next.add(userId);
      else next.delete(userId);
      return { onlineUsers: next };
    }),

  updateConversationTimestamp: (userId, timestamp, user) =>
    set((state) => {
      const existing = state.conversations.find((c) => c.user_id === userId);
      if (existing) {
        return {
          conversations: state.conversations
            .map((c) => (c.user_id === userId ? { ...c, last_message_at: timestamp } : c))
            .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime()),
        };
      }
      if (user) {
        return {
          conversations: [
            { user_id: userId, display_name: user.display_name, username: user.username, last_message_at: timestamp },
            ...state.conversations,
          ],
        };
      }
      return state;
    }),
}));
