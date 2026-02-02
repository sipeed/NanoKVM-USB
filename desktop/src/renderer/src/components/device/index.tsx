import { ReactElement, useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'

import { serialPortStateAtom, videoStateAtom } from '@renderer/jotai/device'

import { Connect } from './connect'
import { Disconnect } from './disconnect'

export const Device = (): ReactElement => {
  const videoState = useAtomValue(videoStateAtom)
  const serialPortState = useAtomValue(serialPortStateAtom)

  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    setIsConnected(videoState === 'connected' && serialPortState === 'connected')
  }, [videoState, serialPortState])

  return <>{isConnected ? <Disconnect /> : <Connect />}</>
}
