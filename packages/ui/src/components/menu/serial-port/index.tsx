import { CpuIcon } from 'lucide-react'

type SerialPortProps = {
  onOpenDeviceModal: () => void
}

/**
 * 已连接时点击图标重新打开设备面板，用于切换串口/波特率。
 */
export const SerialPort = ({ onOpenDeviceModal }: SerialPortProps) => {
  return (
    <div className="flex items-center justify-center text-neutral-300" onClick={onOpenDeviceModal}>
      <div className="flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded text-neutral-300 hover:bg-neutral-700/70 hover:text-white">
        <CpuIcon size={18} />
      </div>
    </div>
  )
}
