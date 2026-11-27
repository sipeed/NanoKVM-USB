/**
 * 串口传输层抽象。
 *
 * 浏览器端由 Web Serial（`navigator.serial`）实现，桌面端由主进程的 node-serialport
 * 通过 IPC 实现。上层（协议与 Device 门面）只依赖本接口，不认识任何平台 API。
 */

export interface SerialPortInfo {
  /** 平台用来打开端口的唯一标识：桌面端为串口路径，Web Serial 为内部编号 */
  path: string
  /** 用于展示的名称 */
  label: string
}

export interface OpenSerialPortOptions {
  /** 桌面端：要打开的串口路径；Web Serial 忽略（使用 request() 选中的端口） */
  path?: string
  baudRate: number
}

export interface SerialTransport {
  /** 传输实现标识，仅用于日志/调试 */
  readonly kind: 'web-serial' | 'ipc'

  /** 当前运行环境是否具备串口能力 */
  isSupported(): boolean

  /** 是否支持枚举端口。桌面端为 true；Web Serial 为 false（必须由用户手势选择） */
  supportsEnumeration(): boolean

  /** 列出可用端口；不支持枚举时返回空数组 */
  list(): Promise<SerialPortInfo[]>

  /** 请求用户选择/授权端口（Web Serial 需要用户手势；桌面端为空操作） */
  request(): Promise<void>

  /** 打开端口。Web Serial 打开的是 request() 选中的端口 */
  open(options: OpenSerialPortOptions): Promise<void>

  /** 关闭端口 */
  close(): Promise<void>

  /** 读取至少 minSize 个字节；超时返回已读到的数据（可能为空数组） */
  read(minSize: number, timeoutMs?: number): Promise<number[]>

  /** 写入原始字节 */
  write(data: number[]): Promise<void>

  /** 注册断连回调，返回取消注册函数 */
  onDisconnect(callback: () => void): () => void
}
