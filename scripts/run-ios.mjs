import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';

if (process.platform !== 'darwin') throw new Error('The iOS simulator requires macOS and Xcode.');

const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', ...options });
const deviceList = JSON.parse(run('xcrun', ['simctl', 'list', 'devices', 'available', '--json']));
const devices = Object.values(deviceList.devices).flat();
const requested = process.env.UDD_IOS_SIMULATOR_UDID;
const device = requested
  ? devices.find(item => item.udid === requested)
  : devices.find(item => item.state === 'Booted' && item.name.startsWith('iPhone')) || devices.find(item => item.name.startsWith('iPhone'));
if (!device) throw new Error('No matching iPhone simulator is installed. Install an iOS runtime in Xcode settings.');
if (device.state !== 'Booted') {
  run('xcrun', ['simctl', 'boot', device.udid]);
  run('xcrun', ['simctl', 'bootstatus', device.udid, '-b'], { stdio: 'inherit' });
}

mkdirSync('output', { recursive: true });
const log = resolve('output/ios-build.log');
const logFile = openSync(log, 'w');
console.log(`Building UDD Go for ${device.name}. Build output: ${log}`);
const result = spawnSync('xcodebuild', [
  '-project', 'ios/App/App.xcodeproj', '-scheme', 'App', '-configuration', 'Debug',
  '-sdk', 'iphonesimulator', '-destination', `id=${device.udid}`,
  '-derivedDataPath', 'output/ios-build', 'CODE_SIGNING_ALLOWED=NO', 'IPHONEOS_DEPLOYMENT_TARGET=15.0', 'build',
], { stdio: ['ignore', logFile, logFile] });
closeSync(logFile);
if (result.error || result.status !== 0) throw new Error(`The simulator build failed. See ${log}. ${result.error?.message || ''}`);

const app = resolve('output/ios-build/Build/Products/Debug-iphonesimulator/App.app');
try { run('xcrun', ['simctl', 'terminate', device.udid, 'ph.edu.udd.go'], { stdio: 'ignore' }); } catch { /* The app may not be running yet. */ }
run('xcrun', ['simctl', 'install', device.udid, app]);
const launchOutput = run('xcrun', ['simctl', 'launch', device.udid, 'ph.edu.udd.go']);
process.stdout.write(launchOutput);
const pid = launchOutput.match(/ph\.edu\.udd\.go:\s*(\d+)/)?.[1];
await new Promise(resolve => setTimeout(resolve, 2000));
if (!pid) throw new Error('The simulator did not report a running app process.');
try { run('ps', ['-p', pid, '-o', 'pid=']); }
catch { throw new Error('UDD Go exited during launch. Check the simulator crash report before retrying.'); }
const developerDir = run('xcode-select', ['-p']).trim();
for (const candidate of [resolve(developerDir, 'Applications/Simulator.app'), resolve(developerDir, '../Applications/DeviceHub.app')]) {
  if (existsSync(candidate)) { run('open', ['-a', candidate]); break; }
}
console.log(`UDD Go is running on ${device.name}. Native demo mode opens the driver view.`);
