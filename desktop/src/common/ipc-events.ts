export enum IpcEvents {
  GET_APP_VERSION = 'get-app-version',
  GET_PLATFORM = 'get-platform',
  OPEN_EXTERNAL_RUL = 'open-external-url',
  REQUEST_MEDIA_PERMISSIONS = 'request-media-permissions',
  SET_FULL_SCREEN = 'set-full-screen',

  GET_SERIAL_PORTS = 'get-serial-ports',
  OPEN_SERIAL_PORT = 'open-serial-port',
  OPEN_SERIAL_PORT_RSP = 'open-serial-port-rsp',
  CLOSE_SERIAL_PORT = 'close-serial-port',
  SEND_KEYBOARD = 'send-keyboard',
  SEND_MOUSE = 'send-mouse',
  SYSTEM_RESUME = 'system-resume',

  UPDATE_AVAILABLE = 'update-available',
  UPDATE_NOT_AVAILABLE = 'update-not-available',
  UPDATE_ERROR = 'update-error',
  DOWNLOAD_PROGRESS = 'download-progress',
  UPDATE_DOWNLOADED = 'update-downloaded',
  CHECK_FOR_UPDATES = 'check-for-updates',
  DOWNLOAD_UPDATE = 'download-update'
}
