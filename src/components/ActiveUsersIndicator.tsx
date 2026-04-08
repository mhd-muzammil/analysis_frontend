import { useStore, type ActiveUser } from '../store/useStore';
import { SESSION_ID } from '../api/websocket';
import { Users, Edit3 } from 'lucide-react';
import { useState } from 'react';

const ACTION_LABELS: Record<string, string> = {
  viewing: 'Viewing',
  editing: 'Editing',
  uploading: 'Uploading',
  processing: 'Processing',
  exporting: 'Exporting',
};

function UserDot({ user, isSelf }: { user: ActiveUser; isSelf: boolean }) {
  const isEditing = user.action === 'editing';
  return (
    <div
      className="relative group"
      title={`${user.username}${isSelf ? ' (you)' : ''} — ${ACTION_LABELS[user.action] || user.action}${user.detail ? `: ${user.detail}` : ''}`}
    >
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold uppercase border ${
          isSelf
            ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
            : 'bg-purple-500/20 text-purple-400 border-purple-500/40'
        }`}
      >
        {user.username.slice(0, 2)}
      </div>
      {isEditing && (
        <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border border-gray-900 flex items-center justify-center">
          <Edit3 className="w-1.5 h-1.5 text-white" />
        </span>
      )}
      {/* Tooltip */}
      <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 hidden group-hover:block z-50">
        <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
          <div className="font-medium text-gray-200">{user.username}{isSelf ? ' (you)' : ''}</div>
          <div className={`mt-0.5 ${isEditing ? 'text-green-400' : 'text-gray-400'}`}>
            {ACTION_LABELS[user.action] || user.action}
            {user.detail ? ` — ${user.detail}` : ''}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ActiveUsersIndicator() {
  const activeUsers = useStore((s) => s.activeUsers);
  const [expanded, setExpanded] = useState(false);

  if (activeUsers.length === 0) return null;

  // Deduplicate by session_id, separate self from others
  const unique = new Map<string, ActiveUser>();
  for (const u of activeUsers) {
    unique.set(u.session_id, u);
  }
  const users = Array.from(unique.values());
  const self = users.find((u) => u.session_id === SESSION_ID);
  const others = users.filter((u) => u.session_id !== SESSION_ID);
  const editingOthers = others.filter((u) => u.action === 'editing');

  return (
    <div className="flex items-center gap-2">
      {/* User avatars */}
      <div className="flex items-center -space-x-1.5">
        {self && <UserDot user={self} isSelf />}
        {others.slice(0, 3).map((u) => (
          <UserDot key={u.session_id} user={u} isSelf={false} />
        ))}
        {others.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-7 h-7 rounded-full bg-gray-700/60 text-gray-300 text-[10px] font-bold border border-gray-600/50 flex items-center justify-center hover:bg-gray-600/60 transition-colors"
          >
            +{others.length - 3}
          </button>
        )}
      </div>

      {/* Live editing indicator */}
      {editingOthers.length > 0 && (
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-400 animate-pulse">
          <Edit3 className="w-3 h-3" />
          <span>
            {editingOthers.map((u) => u.username).join(', ')}{' '}
            {editingOthers.length === 1 ? 'is' : 'are'} editing
          </span>
        </div>
      )}

      {/* Expanded panel */}
      {expanded && (
        <div className="absolute top-14 right-4 bg-gray-900 border border-gray-700 rounded-xl shadow-2xl p-3 z-50 min-w-[200px]">
          <div className="flex items-center gap-2 mb-2 text-xs font-medium text-gray-400">
            <Users className="w-3.5 h-3.5" />
            {users.length} online
          </div>
          {users.map((u) => (
            <div
              key={u.session_id}
              className="flex items-center justify-between py-1.5 text-sm"
            >
              <span className="text-gray-300 capitalize">
                {u.username}
                {u.session_id === SESSION_ID && (
                  <span className="text-gray-500 text-xs ml-1">(you)</span>
                )}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  u.action === 'editing'
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-gray-700/50 text-gray-500'
                }`}
              >
                {ACTION_LABELS[u.action] || u.action}
              </span>
            </div>
          ))}
          <button
            onClick={() => setExpanded(false)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-300 w-full text-center"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
