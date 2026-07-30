const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const hooks = {};
const actions = [];
const snacks = [];
const pluginApi = {
  dispatchAction: (action) => actions.push(action),
  loadSyncedData: async () => null,
  log: { warn: () => undefined },
  onUnload: () => undefined,
  openDialog: async () => undefined,
  persistDataSynced: async () => undefined,
  registerConfigHandler: () => undefined,
  registerHook: (hook, handler) => {
    hooks[hook] = handler;
  },
  showSnack: (snack) => snacks.push(snack),
};

const context = {
  Number,
  Object,
  PluginAPI: pluginApi,
  console,
  document: {},
  setTimeout: (callback) => {
    callback();
    return 1;
  },
  window: {},
};

vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'plugin.js'), 'utf8'), context);

hooks.currentTaskChange({
  current: { id: 'task-without-estimate', timeEstimate: 0 },
  previous: null,
});

assert.strictEqual(actions.length, 0);
assert.match(snacks[0].msg, /Time Estimate/);

hooks.currentTaskChange({
  current: {
    id: 'task-1',
    timeEstimate: 100 * 60 * 1000,
    focusBlockDuration: 50 * 60 * 1000,
    focusBlockCount: 2,
  },
  previous: null,
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(actions.slice(0, 3))), [
  { type: '[FocusMode] Set Mode', mode: 'Countdown' },
  { type: '[FocusMode] Show Overlay' },
  { type: '[FocusMode] Start Session', duration: 50 * 60 * 1000 },
]);

hooks.action({
  action: { type: '[FocusMode] Complete Session', isManual: false },
});

assert.deepStrictEqual(JSON.parse(JSON.stringify(actions.slice(3))), [
  { type: '[Task] SetCurrentTask', id: 'task-1' },
  { type: '[FocusMode] Set Mode', mode: 'Countdown' },
  { type: '[FocusMode] Show Overlay' },
  { type: '[FocusMode] Start Session', duration: 50 * 60 * 1000 },
]);

console.log('Estimated Focus plugin tests passed.');
