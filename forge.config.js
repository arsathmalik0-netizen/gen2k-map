module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Gen2K Marketing Console',
    executableName: 'Gen2K-Marketing-Console',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux', 'win32'],
    },
  ],
};
