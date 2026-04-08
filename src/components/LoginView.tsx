import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { loginApi } from '../api/auth';
import { realtimeClient } from '../api/websocket';
import { Lock, User, LogIn, Activity, AlertCircle } from 'lucide-react';

const LoginView: React.FC = () => {
  const { setLoggedIn, setStep, setUsername: saveUsername } = useStore();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    try {
      const data = await loginApi(username, password);

      // Set auth state
      saveUsername(data.user.username);
      setLoggedIn(true);

      // Connect WebSocket for real-time sync
      realtimeClient.connect();

      // Restore cloud workspace state
      try {
        await useStore.getState().restoreFromCloud();
      } catch (e) {
        console.error('Cloud restore error', e);
      }

      setStep('review');
    } catch (err: any) {
      setError(err.message || 'Invalid username or password');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <div className="w-full max-w-md relative">
        {/* Glow Effects */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-blue-600/20 blur-3xl rounded-full" />
        <div className="absolute -bottom-12 -right-12 w-32 h-32 bg-amber-500/10 blur-3xl rounded-full" />

        <div className="glass-panel relative z-10 p-8 rounded-2xl border border-gray-800 shadow-2xl">
          <div className="flex flex-col items-center mb-8">
            <div className="p-3 bg-blue-500/10 rounded-xl mb-4">
              <Activity className="h-8 w-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-gray-100 mb-2">Welcome Back</h1>
            <p className="text-gray-400 text-sm text-center">
              Please sign in to access the Call Plan Generator
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-4">
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-400">
                  <User className="h-5 w-5 text-gray-500 transition-colors" />
                </div>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all sm:text-sm"
                  placeholder="Username"
                  required
                />
              </div>

              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-colors group-focus-within:text-blue-400">
                  <Lock className="h-5 w-5 text-gray-500 transition-colors" />
                </div>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-10 pr-3 py-3 bg-gray-900/50 border border-gray-800 rounded-xl text-gray-100 placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all sm:text-sm"
                  placeholder="Password"
                  required
                />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm animate-shake">
                <AlertCircle className="h-4 w-4" />
                <p>{error}</p>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="group relative w-full flex justify-center py-3 px-4 border border-transparent rounded-xl text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all duration-200 disabled:opacity-70 disabled:cursor-not-allowed shadow-[0_0_20px_rgba(37,99,235,0.2)]"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <span className="flex items-center">
                  Sign In
                  <LogIn className="ml-2 h-4 w-4 group-hover:translate-x-1 transition-transform" />
                </span>
              )}
            </button>

            <div className="flex items-center justify-center text-xs text-gray-500">
              <p>Secured with JWT authentication</p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default LoginView;
