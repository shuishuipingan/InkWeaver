const { rm } = require('node:fs/promises')
const path = require('node:path')

module.exports = async function removePrivilegedSandboxFromAppImage(context) {
  if (process.env.AI_NOVEL_LINUX_APPIMAGE_BUILD !== '1') return
  if (context.electronPlatformName !== 'linux') return

  // A portable AppImage cannot install a root-owned setuid helper. Remove the
  // unusable helper so Chromium can use the distro's unprivileged user-namespace
  // sandbox. DEB/RPM packages keep it and set root:root 4755 in post-install.
  await rm(path.join(context.appOutDir, 'chrome-sandbox'), { force: true })
}
