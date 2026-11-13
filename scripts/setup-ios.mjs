import { createRequire } from 'node:module';
import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// Capacitor 7.6.10 lowercases the --packagemanager option before comparing it
// with "SPM". Configure its local CLI directly to use the bundled SPM template.
const require = createRequire(import.meta.url);
const { loadConfig } = require('@capacitor/cli/dist/config.js');
const { addCommand } = require('@capacitor/cli/dist/tasks/add.js');
const { sync } = require('@capacitor/cli/dist/tasks/sync.js');
const config = await loadConfig();
if (existsSync(config.ios.platformDirAbs)) {
  await sync(config, 'ios', false, false);
} else {
  config.ios.packageManager = Promise.resolve('SPM');
  config.cli.assets.ios.platformTemplateArchive = 'ios-spm-template.tar.gz';
  config.cli.assets.ios.platformTemplateArchiveAbs = resolve(config.cli.assetsDirAbs, 'ios-spm-template.tar.gz');
  await addCommand(config, 'ios');
}

const infoPlist = resolve(config.ios.nativeProjectDirAbs, 'App/Info.plist');
copyFileSync(new URL('../native/ios/AppDelegate.swift', import.meta.url), resolve(config.ios.nativeProjectDirAbs, 'App/AppDelegate.swift'));
const projectFile = resolve(config.ios.nativeProjectDirAbs, 'App.xcodeproj/project.pbxproj');
writeFileSync(projectFile, readFileSync(projectFile, 'utf8').replace(/IPHONEOS_DEPLOYMENT_TARGET = 14\.0;/g, 'IPHONEOS_DEPLOYMENT_TARGET = 15.0;'));
try {
  execFileSync('/usr/libexec/PlistBuddy', ['-c', 'Print :UIApplicationSceneManifest', infoPlist], { stdio: 'ignore' });
} catch {
  for (const command of [
    'Add :UIApplicationSceneManifest dict',
    'Add :UIApplicationSceneManifest:UIApplicationSupportsMultipleScenes bool false',
    'Add :UIApplicationSceneManifest:UISceneConfigurations dict',
    'Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication array',
    'Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0 dict',
    'Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneConfigurationName string Default Configuration',
    'Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneDelegateClassName string $(PRODUCT_MODULE_NAME).SceneDelegate',
    'Add :UIApplicationSceneManifest:UISceneConfigurations:UIWindowSceneSessionRoleApplication:0:UISceneStoryboardFile string Main',
  ]) execFileSync('/usr/libexec/PlistBuddy', ['-c', command, infoPlist]);
}
for (const [key, description] of Object.entries({
  NSLocationWhenInUseUsageDescription: 'UDD Go shares your bus location with your assigned students and school during an active trip.',
  NSLocationAlwaysAndWhenInUseUsageDescription: 'UDD Go uses your location while you keep your active school bus trip open.',
})) {
  try {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Print :${key}`, infoPlist], { stdio: 'ignore' });
  } catch {
    execFileSync('/usr/libexec/PlistBuddy', ['-c', `Add :${key} string ${description}`, infoPlist], { stdio: 'inherit' });
  }
}
