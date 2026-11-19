export enum IpcEvents {
  GET_APP_VERSION = 'get-app-version',
  GET_PLATFORM = 'get-platform',
  OPEN_EXTERNAL_URL = 'open-external-url',
  CHECK_MEDIA_PERMISSION = 'check-media-permission',
  REQUEST_MEDIA_PERMISSION = 'request-media-permission',

  SERIAL_LIST = 'serial-list',
  SERIAL_OPEN = 'serial-open',
  SERIAL_CLOSE = 'serial-close',
  SERIAL_READ = 'serial-read',
  SERIAL_WRITE = 'serial-write',
  SERIAL_DISCONNECTED = 'serial-disconnected',

  UPDATE_AVAILABLE = 'update-available',
  UPDATE_NOT_AVAILABLE = 'update-not-available',
  UPDATE_ERROR = 'update-error',
  DOWNLOAD_PROGRESS = 'download-progress',
  UPDATE_DOWNLOADED = 'update-downloaded',
  CHECK_FOR_UPDATES = 'check-for-updates',
  DOWNLOAD_UPDATE = 'download-update'
}
