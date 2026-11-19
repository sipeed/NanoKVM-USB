const { notarize } = require('@electron/notarize')

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context
  if (electronPlatformName !== 'darwin') {
    return
  }

  // 本地/未配置 secrets 的 mac 构建跳过公证，避免直接失败（产物未公证，Gatekeeper 会提示）
  const { APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID } = process.env
  if (!APPLE_ID || !APPLE_APP_SPECIFIC_PASSWORD || !APPLE_TEAM_ID) {
    console.warn(
      '[notarize] skipped: APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID not set'
    )
    return
  }

  const appName = context.packager.appInfo.productFilename

  return await notarize({
    appBundleId: 'com.sipeed.usbkvm',
    appPath: `${appOutDir}/${appName}.app`,
    teamId: APPLE_TEAM_ID,
    appleId: APPLE_ID,
    appleIdPassword: APPLE_APP_SPECIFIC_PASSWORD
  })
}
