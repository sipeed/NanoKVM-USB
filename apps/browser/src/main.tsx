import { StrictMode } from 'react'
import { StyleProvider } from '@ant-design/cssinjs'
import { ConfigProvider, theme } from 'antd'
import { createRoot } from 'react-dom/client'

import { createDevice } from '@nanokvm/core'
import { App, initServices } from '@nanokvm/ui'

import '@nanokvm/ui/i18n'
import '@nanokvm/ui/styles/index.css'

import { BrowserPlatform } from './platform/browser'

const platform = new BrowserPlatform()
initServices(platform, createDevice(platform.transport))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StyleProvider layer>
      <ConfigProvider theme={{ algorithm: theme.darkAlgorithm }}>
        <div className="flex h-screen w-screen flex-col items-center justify-center overflow-hidden">
          <App />
        </div>
      </ConfigProvider>
    </StyleProvider>
  </StrictMode>
)
