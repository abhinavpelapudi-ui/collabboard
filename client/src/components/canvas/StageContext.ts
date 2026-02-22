import { createContext, useContext } from 'react'
import type Konva from 'konva'

export const StageContext = createContext<React.RefObject<Konva.Stage | null> | null>(null)

export function useStageRef(): React.RefObject<Konva.Stage | null> {
  const ref = useContext(StageContext)
  if (!ref) throw new Error('useStageRef must be used within StageContext.Provider')
  return ref
}
