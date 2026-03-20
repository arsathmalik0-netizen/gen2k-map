module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Gen2K Marketing Console',
    executableName: 'Gen2K-Marketing-Console',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'gen2k_marketing_console',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['win32'],
    },
  ],
};
