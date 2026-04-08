import { useEffect, useState } from 'react';
import { useStore } from './store/useStore';
import ReviewView from './components/ReviewView';
import LoginView from './components/LoginView';
import { realtimeClient } from './api/websocket';
import { getAccessToken } from './api/auth';
import { Activity, LogOut, User, Wifi, WifiOff, RefreshCw } from 'lucide-react';


function App() {
  const { step, isLoggedIn, username, logout, wsConnected } = useStore();
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Connect WebSocket when user is logged in (handles page refresh)
  useEffect(() => {
    if (isLoggedIn && getAccessToken()) {
      realtimeClient.connect();
    }
    return () => {
      // Don't disconnect on unmount during HMR, only on actual unload
    };
  }, [isLoggedIn]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await useStore.getState().restoreFromCloud();
    } catch (e) {
      console.error(e);
    }
    setTimeout(() => setIsRefreshing(false), 500);
  };

  return (
    <div className="min-h-screen text-gray-100 font-sans pb-12">
      {/* Premium Ambient Background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full isolate" />
        <div className="absolute top-[20%] right-[-10%] w-[30%] h-[50%] bg-amber-500/5 blur-[100px] rounded-full isolate" />
        <div className="absolute bottom-[-20%] left-[20%] w-[40%] h-[40%] bg-green-500/5 blur-[100px] rounded-full isolate" />
      </div>

      {/* Global Navbar - Only visible when logged in */}
      {isLoggedIn && (
        <nav className="relative z-10 glass-panel border-x-0 border-t-0 border-b-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <Activity className="h-6 w-6 text-blue-400" />
                </div>
                <span className="font-semibold text-xl tracking-tight bg-gradient-to-r from-gray-100 to-gray-400 bg-clip-text text-transparent">
                  Renderways Call Plan Generator
                </span>
              </div>

              <div className="flex items-center gap-4">
                {/* Real-time connection indicator */}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${
                    wsConnected
                      ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                  }`}
                  title={wsConnected ? 'Real-time sync active' : 'Reconnecting...'}
                >
                  {wsConnected ? (
                    <Wifi className="h-3.5 w-3.5" />
                  ) : (
                    <WifiOff className="h-3.5 w-3.5" />
                  )}
                  {wsConnected ? 'Live' : 'Offline'}
                </div>

                <button
                  onClick={handleRefresh}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-blue-400 hover:text-blue-300 hover:bg-blue-500/10 rounded-lg border border-transparent transition-all"
                  title="Pull latest changes from server"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Sync
                </button>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 rounded-lg border border-gray-700/50">
                  <User className="h-4 w-4 text-blue-400" />
                  <span className="text-sm font-medium text-gray-300 capitalize">{username}</span>
                </div>
                <button
                  onClick={logout}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg border border-transparent hover:border-red-500/20 transition-all"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          </div>
        </nav>
      )}

      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {step === 'login' && <LoginView />}
        {step === 'review' && <ReviewView />}
        {step === 'export' && <ReviewView />}
      </main>
    </div>
  );
}

export default App;
