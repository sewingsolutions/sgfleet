import { createContext, useContext } from 'react'

type ConfirmHandler = (message: string, danger?: boolean) => Promise<boolean>

const ConfirmContext = createContext<ConfirmHandler>(async () => false)

export function useConfirm() {
  return useContext(ConfirmContext)
}

export { ConfirmContext }
