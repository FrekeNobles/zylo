import { useState, useEffect } from 'react';
import { Search, Shield, LogOut, Plus, X, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useStore } from '../lib/store';
import { api } from '../lib/crypto';
import type { SearchUser } from '../types';

interface SidebarProps {
  onSelectConversation: (userId: string, user: { id: string; username: string; display_name: string }) => void;
}

export default function Sidebar({ onSelectConversation }: SidebarProps) {
  const {
    user,
    accessToken,
    refreshToken,
    conversations,
    activeConversationUserId,
    onlineUsers,
    clearAuth,
    setConversations,
  } = useStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  // Load conversations on mount
  useEffect(() => {
    if (!accessToken) return;
    api.getConversations(accessToken).then(setConversations).catch(() => {});
  }, [accessToken, setConversations]);

  // Search with debounce
  useEffect(() => {
    if (!searchQuery.trim() || !accessToken) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const results = await api.searchUsers(accessToken, searchQuery);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery, accessToken]);

  const handleLogout = async () => {
    if (accessToken && refreshToken) {
      try {
        await api.logout(accessToken, refreshToken);
      } catch {}
    }
    clearAuth();
  };

  const handleSelectUser = (u: SearchUser) => {
    onSelectConversation(u.id, { id: u.id, username: u.username, display_name: u.display_name });
    setShowSearch(false);
    setSearchQuery('');
    setSearchResults([]);
  };

  const filteredConversations = conversations.filter(
    (c) =>
      !searchQuery ||
      c.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.display_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <aside className="w-40 sm:w-40 md:w-72 shrink-0 bg-zinc-900 border-r border-zinc-800 md:flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-4 border-b border-zinc-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-purple-600 flex items-center justify-center">
              <Shield size={14} className="text-white" />
            </div>
            <span className="text-white font-semibold tracking-tight">Zylo</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch((v) => !v)}
              className="w-8 h-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-all"
              title="New conversation"
            >
              {showSearch ? <X size={15} /> : <Plus size={15} />}
            </button>
            <button
              onClick={handleLogout}
              className="w-8 h-8 rounded-lg hover:bg-zinc-800 flex items-center justify-center text-zinc-500 hover:text-zinc-300 transition-all"
              title="Sign out"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>

        {/* Current user */}
        <div className="mt-3 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-purple-800 flex items-center justify-center text-purple-200 text-xs font-semibold shrink-0">
            {user?.display_name?.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{user?.display_name}</p>
            <p className="text-zinc-500 text-xs font-mono truncate">@{user?.username}</p>
          </div>
        </div>
      </div>

      {/* Search panel */}
      {showSearch && (
        <div className="border-b border-zinc-800 p-3 animate-fade-in">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500" />
            <input
              autoFocus
              type="text"
              placeholder="Search users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded-lg pl-8 pr-3 py-2 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-purple-500 transition-colors"
            />
          </div>
          {searching && (
            <p className="text-zinc-600 text-xs px-1 mt-2">Searching...</p>
          )}
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {searchResults.map((u) => (
                <button
                  key={u.id}
                  onClick={() => handleSelectUser(u)}
                  className="w-full flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-zinc-800 transition-colors text-left"
                >
                  <div className="w-7 h-7 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-xs font-semibold shrink-0">
                    {u.display_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-white text-sm font-medium truncate">{u.display_name}</p>
                    <p className="text-zinc-500 text-xs font-mono truncate">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {searchQuery && !searching && searchResults.length === 0 && (
            <p className="text-zinc-600 text-xs px-1 mt-2">No users found</p>
          )}
        </div>
      )}

      {/* Conversations */}
      <div className="flex-1 overflow-y-auto py-2">
        {!showSearch && conversations.length === 0 && (
          <div className="flex flex-col items-center justify-center h-40 gap-3 px-6 text-center">
            <MessageSquare size={24} className="text-zinc-700" />
            <p className="text-zinc-600 text-sm">No conversations yet. Start one using the + button.</p>
          </div>
        )}
        {filteredConversations.map((conv) => {
          const isActive = activeConversationUserId === conv.user_id;
          const isOnline = onlineUsers.has(conv.user_id);
          return (
            <button
              key={conv.user_id}
              onClick={() =>
                onSelectConversation(conv.user_id, {
                  id: conv.user_id,
                  username: conv.username,
                  display_name: conv.display_name,
                })
              }
              className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/60 transition-colors text-left ${
                isActive ? 'bg-zinc-800' : ''
              }`}
            >
              <div className="relative shrink-0">
                <div className="w-9 h-9 rounded-full bg-zinc-700 flex items-center justify-center text-zinc-300 text-sm font-semibold">
                  {conv.display_name.charAt(0).toUpperCase()}
                </div>
                {isOnline && (
                  <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-zinc-900" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <p className={`text-sm font-medium truncate ${isActive ? 'text-white' : 'text-zinc-200'}`}>
                    {conv.display_name}
                  </p>
                  <span className="text-zinc-600 text-xs shrink-0">
                    {formatDistanceToNow(new Date(conv.last_message_at), { addSuffix: false })}
                  </span>
                </div>
                <p className="text-zinc-500 text-xs font-mono truncate">@{conv.username}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* E2EE status bar */}
      <div className="px-4 py-3 border-t border-zinc-800">
        <div className="flex items-center gap-1.5">
          <Shield size={11} className="text-purple-500" />
          <span className="text-zinc-600 text-xs font-mono">E2EE — server never sees plaintext</span>
        </div>
      </div>
    </aside>
  );
}
