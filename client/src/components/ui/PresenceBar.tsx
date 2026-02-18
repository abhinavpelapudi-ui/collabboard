import { usePresenceStore } from '../../stores/presenceStore'

export default function PresenceBar() {
  const { users } = usePresenceStore()

  return (
    <div className="flex items-center gap-1">
      {users.slice(0, 6).map(user => (
        <div
          key={user.userId}
          title={user.userName}
          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-gray-900"
          style={{ backgroundColor: user.userColor }}
        >
          {user.userName.charAt(0).toUpperCase()}
        </div>
      ))}
      {users.length > 6 && (
        <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-xs text-gray-300">
          +{users.length - 6}
        </div>
      )}
    </div>
  )
}
