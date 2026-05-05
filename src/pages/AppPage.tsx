import { Shield, MessageSquare } from 'lucide-react';
import { useStore } from '../lib/store';
import Sidebar from '../components/Sidebar';
import ChatWindow from '../components/ChatWindow';
import { useWebSocket } from '../hooks/useWebSocket';

export default function AppPage() {
  const { activeConversationUserId, activeConversationUser, setActiveConversation } = useStore();

  // Initialize WebSocket connection at the app level
  useWebSocket();

  const handleSelectConversation = (
    userId: string,
    user: { id: string; username: string; display_name: string }
  ) => {
    setActiveConversation(userId, user);
  };

  return (
    <div className="flex h-screen bg-zinc-950 overflow-hidden">
      <Sidebar onSelectConversation={handleSelectConversation} />

      <main className="flex-1 flex min-w-0">
        {activeConversationUserId && activeConversationUser ? (
          <ChatWindow
            key={activeConversationUserId}
            recipientId={activeConversationUserId}
            recipientUser={activeConversationUser}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center px-8">
            <div className="relative">
              <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-800 flex items-center justify-center">
                <MessageSquare size={28} className="text-zinc-700" />
              </div>
              <div className="absolute -top-1 -right-1 w-6 h-6 rounded-lg bg-purple-600 flex items-center justify-center">
                <Shield size={12} className="text-white" />
              </div>
            </div>
            <div>
              <p className="text-zinc-300 font-semibold">Select a conversation</p>
              <p className="text-zinc-600 text-sm mt-1 max-w-xs">
                Or start a new one using the + button. All messages are end-to-end encrypted.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 max-w-sm w-full">
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left">
                <p className="text-purple-400 text-xs font-mono mb-1">AES-GCM-256</p>
                <p className="text-zinc-500 text-xs">Symmetric message encryption</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left">
                <p className="text-purple-400 text-xs font-mono mb-1">RSA-OAEP-2048</p>
                <p className="text-zinc-500 text-xs">Asymmetric key exchange</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left">
                <p className="text-purple-400 text-xs font-mono mb-1">PBKDF2 + AES-KW</p>
                <p className="text-zinc-500 text-xs">Password-based key wrapping</p>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 text-left">
                <p className="text-purple-400 text-xs font-mono mb-1">WebCrypto API</p>
                <p className="text-zinc-500 text-xs">Browser-native encryption</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
