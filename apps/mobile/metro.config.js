// Ortak paket (packages/shared) web, API ve mobil uygulama tarafından kullanılır.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../../packages/shared');
const config = getDefaultConfig(projectRoot);

config.watchFolders = [sharedRoot];
config.resolver.extraNodeModules = { '@nexus/shared': path.join(sharedRoot, 'src') };
config.resolver.nodeModulesPaths = [path.resolve(projectRoot, 'node_modules')];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // shared paketindeki ESM tarzı "./x.js" importlarını TypeScript kaynağına yönlendir
  if (moduleName.startsWith('.') && moduleName.endsWith('.js') && context.originModulePath.startsWith(sharedRoot)) {
    return context.resolveRequest(context, moduleName.slice(0, -3), platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
