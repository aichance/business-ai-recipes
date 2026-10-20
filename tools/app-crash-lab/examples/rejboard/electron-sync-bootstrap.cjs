// Test-only launcher. Production renderer, preload and sync IPC are not replaced.
const { app, dialog, ipcMain } = require('electron');
const fs = require('node:fs');
const path = require('node:path');

const root = fs.realpathSync(process.env.REJBOARD_TEST_ROOT);
if (fs.readFileSync(path.join(root, 'TEST-ONLY'), 'utf8') !== 'App Crash Lab synthetic test\n') throw Error('Missing test marker');
const inside = name => {
  const target = fs.realpathSync(process.env[name]);
  if (!target.startsWith(root + path.sep)) throw Error('Test path must remain inside its disposable root');
  return target;
};
const profile = inside('REJBOARD_TEST_PROFILE');
const folder = inside('REJBOARD_TEST_FOLDER');
const source = fs.realpathSync(process.env.REJBOARD_SOURCE_DIR);
const evidence = globalThis.__rejboardAcceptance = { paths: {}, blockedNetwork: [], blockedIPC: [] };
// appData must be isolated too: upstream checks its legacy app directory at require time.
for (const name of ['appData', 'userData', 'sessionData', 'logs', 'crashDumps']) {
  const target = path.join(profile, name); fs.mkdirSync(target, { recursive: true });
  app.setPath(name, target); evidence.paths[name] = target;
}
app.setName('AppCrashLabRejBoardTest');
// BrowserWindow.loadFile resolves against appPath, not process.cwd().
app.setAppPath(source);
app.commandLine.appendSwitch('disable-background-networking');
app.commandLine.appendSwitch('disable-component-update');
// Only the folder chooser result is automated. Actual sync:* handlers still use real fs.
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
const handle = ipcMain.handle.bind(ipcMain);
ipcMain.handle = (channel, callback) => handle(channel, (...args) => {
  if (channel.startsWith('sync:') || ['i18n:fetch', 'updates:version', 'updates:activity'].includes(channel)) return callback(...args);
  evidence.blockedIPC.push(channel); throw Error('Unrelated feature disabled by test launcher: ' + channel);
});
app.on('web-contents-created', (_event, contents) => {
  contents.session.setPermissionRequestHandler((_webContents, _permission, done) => done(false));
  contents.session.webRequest.onBeforeRequest((request, done) => {
    const protocol = new URL(request.url).protocol;
    const cancel = !['file:', 'data:', 'blob:', 'about:', 'devtools:'].includes(protocol);
    if (cancel) evidence.blockedNetwork.push(new URL(request.url).origin);
    done({ cancel });
  });
});
process.chdir(source);
require(path.join(source, 'main.js'));
