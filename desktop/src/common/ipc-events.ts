export enum IpcEvents {
  GET_APP_VERSION = 'get-app-version',
  GET_PLATFORM = 'get-platform',
  OPEN_EXTERNAL_URL = 'open-external-url',
  CHECK_MEDIA_PERMISSION = 'check-media-permission',
  REQUEST_MEDIA_PERMISSION = 'request-media-permission',
  SET_FULL_SCREEN = 'set-full-screen',

  GET_SERIAL_PORTS = 'get-serial-ports',
  OPEN_SERIAL_PORT = 'open-serial-port',
  OPEN_SERIAL_PORT_RSP = 'open-serial-port-rsp',
  CLOSE_SERIAL_PORT = 'close-serial-port',
  SERIAL_PORT_DISCONNECTED = 'serial-port-disconnected',
  SEND_KEYBOARD = 'send-keyboard',
  SEND_MOUSE = 'send-mouse',
  SYSTEM_RESUME = 'system-resume',

  UPDATE_AVAILABLE = 'update-available',
  UPDATE_NOT_AVAILABLE = 'update-not-available',
  UPDATE_ERROR = 'update-error',
  DOWNLOAD_PROGRESS = 'download-progress',
  UPDATE_DOWNLOADED = 'update-downloaded',
  CHECK_FOR_UPDATES = 'check-for-updates',
  DOWNLOAD_UPDATE = 'download-update',

  // Picoclaw AI Agent
  PICOCLAW_START = 'picoclaw-start',
  PICOCLAW_STOP = 'picoclaw-stop',
  PICOCLAW_STATUS = 'picoclaw-status',
  PICOCLAW_SEND_MESSAGE = 'picoclaw-send-message',
  PICOCLAW_MESSAGE_RECEIVED = 'picoclaw-message-received',
  PICOCLAW_GET_CONFIG = 'picoclaw-get-config',
  PICOCLAW_UPDATE_CONFIG = 'picoclaw-update-config'
}
