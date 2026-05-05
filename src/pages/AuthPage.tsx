import { useState } from 'react';
import { Shield, Eye, EyeOff, Lock } from 'lucide-react';
import { api, prepareRegistrationKeys, restorePrivateKey, importPublicKey } from '../lib/crypto';
import { useStore } from '../lib/store';

type Mode = 'login' | 'register';

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const setAuth = useStore((s) => s.setAuth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!displayName.trim()) throw new Error('Display name is required');
        if (username.length < 3) throw new Error('Username must be at least 3 characters');
        if (password.length < 8) throw new Error('Password must be at least 8 characters');

        const keys = await prepareRegistrationKeys(password);
        const res = await api.register({
          username: username.toLowerCase(),
          display_name: displayName.trim(),
          password,
          public_key: keys.publicKeyB64,
          wrapped_private_key: keys.wrappedPrivateKeyB64,
          pbkdf2_salt: keys.pbkdf2SaltB64,
        });

        setAuth(res.access_token, res.refresh_token, res.user, {
          privateKey: keys.privateKey,
          publicKey: keys.publicKey,
        });
      } else {
        const res = await api.login({ username: username.toLowerCase(), password });
        const privateKey = await restorePrivateKey(
          res.user.wrapped_private_key,
          res.user.pbkdf2_salt,
          password
        );
        const publicKey = await importPublicKey(res.user.public_key);
        setAuth(res.access_token, res.refresh_token, res.user, { privateKey, publicKey });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center px-4">
      {/* Background grid */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(#a855f7 1px, transparent 1px), linear-gradient(90deg, #a855f7 1px, transparent 1px)`,
          backgroundSize: '64px 64px',
        }}
      />

      <div className="relative w-full max-w-sm animate-slide-up">
        {/* Logo */}
        <div className="flex items-center gap-3 mb-10">
          <div className="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-900/40">
            <Shield size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-white font-semibold text-xl tracking-tight">Zylo</h1>
            <p className="text-zinc-500 text-xs font-mono">Connecting you to your loved ones....</p>
          </div>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <div className="mb-6">
            <h2 className="text-white font-semibold text-lg">
              {mode === 'login' ? 'Sign in' : 'Create account'}
            </h2>
            <p className="text-zinc-500 text-sm mt-1">
              {mode === 'login'
                ? 'Your private key never leaves your device.'
                : 'Keys are generated on your device and never sent in plaintext.'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-zinc-400 text-xs font-medium mb-1.5 uppercase tracking-wider">
                  Display Name
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Alice"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all"
                  required
                  autoComplete="name"
                />
              </div>
            )}

            <div>
              <label className="block text-zinc-400 text-xs font-medium mb-1.5 uppercase tracking-wider">
                Username
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                placeholder="your username"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all font-mono"
                required
                autoComplete="username"
                minLength={3}
                maxLength={32}
              />
            </div>

            <div>
              <label className="block text-zinc-400 text-xs font-medium mb-1.5 uppercase tracking-wider">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 pr-11 text-white placeholder-zinc-600 text-sm focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500/30 transition-all"
                  required
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  minLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-950/50 border border-red-800/50 rounded-xl px-4 py-3 text-red-400 text-sm animate-fade-in">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-900 disabled:text-purple-600 text-white font-medium py-3 rounded-xl transition-all text-sm mt-2 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === 'register' ? 'Generating keys...' : 'Decrypting keys...'}
                </>
              ) : (
                <>
                  <Lock size={14} />
                  {mode === 'login' ? 'Sign in' : 'Create account'}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-zinc-800 text-center">
            <button
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
              className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
            >
              {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
              <span className="text-purple-400 hover:text-purple-300">
                {mode === 'login' ? 'Register' : 'Sign in'}
              </span>
            </button>
          </div>
        </div>

        {/* Security note */}
        <div className="mt-4 flex items-start gap-2 px-1">
          <Shield size={13} className="text-zinc-600 mt-0.5 shrink-0" />
          <p className="text-zinc-600 text-xs leading-relaxed">
            Zylo is committed to ensuring your privacy, developed by Freke Nobles
          </p>
        </div>
      </div>
    </div>
  );
}
