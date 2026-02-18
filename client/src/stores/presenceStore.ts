import { create } from 'zustand'
import { PresenceUser } from '@collabboard/shared'

interface PresenceStore {
  users: PresenceUser[]
  setUsers: (users: PresenceUser[]) => void
}

export const usePresenceStore = create<PresenceStore>((set) => ({
  users: [],
  setUsers: (users) => set({ users }),
}))
