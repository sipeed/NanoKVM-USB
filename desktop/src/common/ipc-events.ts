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
  PICOCLAW_UPDATE_CONFIG = 'picoclaw-update-config',
  PICOCLAW_START_GATEWAY = 'picoclaw-start-gateway',
  PICOCLAW_STOP_GATEWAY = 'picoclaw-stop-gateway',
  PICOCLAW_GATEWAY_STATUS = 'picoclaw-gateway-status',
  PICOCLAW_GET_VERSION = 'picoclaw-get-version',

  PICOCLAW_GET_PROVIDERS = 'picoclaw-get-providers',
  PICOCLAW_DETECT_GITHUB_AUTH = 'picoclaw-detect-github-auth',
  PICOCLAW_INITIATE_GITHUB_AUTH = 'picoclaw-initiate-github-auth',
  PICOCLAW_CANCEL_GITHUB_AUTH = 'picoclaw-cancel-github-auth',

  // Model update
  PICOCLAW_GET_MODEL_UPDATE_SCHEDULE = 'picoclaw-get-model-update-schedule',
  PICOCLAW_SET_MODEL_UPDATE_SCHEDULE = 'picoclaw-set-model-update-schedule',
  PICOCLAW_UPDATE_MODELS_NOW = 'picoclaw-update-models-now',
  PICOCLAW_GET_MODEL_UPDATE_STATUS = 'picoclaw-get-model-update-status',

  // Screen capture & login verification
  SCREEN_CAPTURE = 'screen-capture',
  SCREEN_CAPTURE_RESULT = 'screen-capture-result',
  VERIFY_LOGIN_RESULT = 'verify-login-result'
}
