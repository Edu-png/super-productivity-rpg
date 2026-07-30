// Estimated Focus
// Runs configurable countdown blocks while a task is being tracked.

var _estimatedFocusDefaults = {
  blocksPerCycle: 2,
};
var _estimatedFocusConfig = Object.assign({}, _estimatedFocusDefaults);
var _estimatedFocusActiveTaskId = null;
var _estimatedFocusBlock = 0;
var _estimatedFocusEnabled = false;
var _estimatedFocusStartingBlock = false;
var _estimatedFocusRestartPending = false;
var _estimatedFocusAudioContext = null;
var _estimatedFocusBlockDurationMs = 0;
var _estimatedFocusTaskBlockCount = 0;

async function _estimatedFocusLoadConfig() {
  var raw = await PluginAPI.loadSyncedData();
  if (!raw) {
    return Object.assign({}, _estimatedFocusDefaults);
  }

  try {
    var parsed = JSON.parse(raw);
    return {
      blocksPerCycle: _estimatedFocusClampInteger(
        parsed.blocksPerCycle,
        1,
        100,
        _estimatedFocusDefaults.blocksPerCycle,
      ),
    };
  } catch (error) {
    PluginAPI.log.warn('Estimated Focus: invalid saved configuration', error);
    return Object.assign({}, _estimatedFocusDefaults);
  }
}

function _estimatedFocusClampInteger(value, min, max, fallback) {
  var number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function _estimatedFocusStartBlock() {
  if (
    !_estimatedFocusEnabled ||
    !_estimatedFocusActiveTaskId ||
    !_estimatedFocusBlockDurationMs
  ) {
    return;
  }

  _estimatedFocusStartingBlock = true;
  _estimatedFocusBlock =
    (_estimatedFocusBlock % _estimatedFocusTaskBlockCount) + 1;

  PluginAPI.dispatchAction({
    type: '[FocusMode] Set Mode',
    mode: 'Countdown',
  });
  PluginAPI.dispatchAction({
    type: '[FocusMode] Show Overlay',
  });
  PluginAPI.dispatchAction({
    type: '[FocusMode] Start Session',
    duration: _estimatedFocusBlockDurationMs,
  });

  PluginAPI.showSnack({
    msg:
      'Focus block ' +
      _estimatedFocusBlock +
      '/' +
      _estimatedFocusTaskBlockCount +
      ' · ' +
      Math.round(_estimatedFocusBlockDurationMs / 60000) +
      ' min',
    type: 'INFO',
    ico: 'timer',
  });

  setTimeout(function () {
    _estimatedFocusStartingBlock = false;
  }, 0);
}

function _estimatedFocusPlayAlarm() {
  try {
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    if (!_estimatedFocusAudioContext) {
      _estimatedFocusAudioContext = new AudioContextClass();
    }
    var context = _estimatedFocusAudioContext;
    if (context.state === 'suspended') {
      context.resume();
    }

    var startAt = context.currentTime;
    [0, 0.28, 0.56].forEach(function (offset, index) {
      var oscillator = context.createOscillator();
      var gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = index === 2 ? 1046.5 : 880;
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.35, startAt + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.22);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.24);
    });
  } catch (error) {
    PluginAPI.log.warn('Estimated Focus: could not play alarm', error);
  }
}

PluginAPI.registerHook('currentTaskChange', function (payload) {
  var task = payload && payload.current ? payload.current : null;

  if (!task) {
    if (_estimatedFocusStartingBlock || _estimatedFocusRestartPending) return;
    _estimatedFocusEnabled = false;
    _estimatedFocusActiveTaskId = null;
    _estimatedFocusBlock = 0;
    return;
  }

  if (_estimatedFocusEnabled && _estimatedFocusActiveTaskId === task.id) {
    return;
  }

  var taskBlockDuration =
    Number.isFinite(task.focusBlockDuration) && task.focusBlockDuration > 0
      ? task.focusBlockDuration
      : task.timeEstimate;

  if (!Number.isFinite(taskBlockDuration) || taskBlockDuration <= 0) {
    _estimatedFocusEnabled = false;
    _estimatedFocusActiveTaskId = null;
    _estimatedFocusBlockDurationMs = 0;
    _estimatedFocusTaskBlockCount = 0;
    PluginAPI.showSnack({
      msg: 'Set Time Estimate (the right circle in Duration) before pressing play.',
      type: 'WARNING',
      ico: 'hourglass_empty',
    });
    return;
  }

  _estimatedFocusActiveTaskId = task.id;
  _estimatedFocusBlockDurationMs = taskBlockDuration;
  _estimatedFocusTaskBlockCount = _estimatedFocusClampInteger(
    task.focusBlockCount,
    1,
    100,
    _estimatedFocusConfig.blocksPerCycle,
  );
  _estimatedFocusBlock = 0;
  _estimatedFocusEnabled = true;

  // Initialize audio during the user's play interaction so the browser permits
  // the later alarm triggered by timer completion.
  _estimatedFocusPrepareAudio();
  _estimatedFocusStartBlock();
});

function _estimatedFocusPrepareAudio() {
  try {
    var AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass && !_estimatedFocusAudioContext) {
      _estimatedFocusAudioContext = new AudioContextClass();
    }
    if (
      _estimatedFocusAudioContext &&
      _estimatedFocusAudioContext.state === 'suspended'
    ) {
      _estimatedFocusAudioContext.resume();
    }
  } catch (error) {
    PluginAPI.log.warn('Estimated Focus: could not prepare audio', error);
  }
}

PluginAPI.registerHook('action', function (payload) {
  var action = payload && payload.action ? payload.action : null;
  if (
    !_estimatedFocusEnabled ||
    !action ||
    action.type !== '[FocusMode] Complete Session' ||
    action.isManual === true
  ) {
    return;
  }

  _estimatedFocusPlayAlarm();
  _estimatedFocusRestartPending = true;
  setTimeout(function () {
    if (!_estimatedFocusEnabled || !_estimatedFocusActiveTaskId) {
      _estimatedFocusRestartPending = false;
      return;
    }
    PluginAPI.dispatchAction({
      type: '[Task] SetCurrentTask',
      id: _estimatedFocusActiveTaskId,
    });
    _estimatedFocusStartBlock();
    _estimatedFocusRestartPending = false;
  }, 900);
});

async function _estimatedFocusOpenSettings() {
  var config = await _estimatedFocusLoadConfig();
  var html =
    '<div style="display:grid;gap:var(--s2);padding:var(--s-half) 0">' +
    '<p style="margin:0;opacity:.75">Each block uses the task Time Estimate and repeats automatically while the task is running.</p>' +
    '<label style="display:grid;gap:var(--s-half)">' +
    '<span>Blocks per cycle</span>' +
    '<input id="estimated-focus-blocks" type="number" min="1" max="100" value="' +
    config.blocksPerCycle +
    '">' +
    '</label>' +
    '</div>';

  await PluginAPI.openDialog({
    title: 'Estimated Focus settings',
    htmlContent: html,
    buttons: [
      { label: 'Cancel' },
      {
        label: 'Save',
        color: 'primary',
        icon: 'save',
        raised: true,
        onClick: async function () {
          var blocksInput = document.getElementById('estimated-focus-blocks');
          var nextConfig = {
            blocksPerCycle: _estimatedFocusClampInteger(
              blocksInput && blocksInput.value,
              1,
              100,
              config.blocksPerCycle,
            ),
          };

          await PluginAPI.persistDataSynced(JSON.stringify(nextConfig));
          _estimatedFocusConfig = nextConfig;
          PluginAPI.showSnack({
            msg: 'Estimated Focus settings saved.',
            type: 'SUCCESS',
            ico: 'check',
          });
        },
      },
    ],
  });
}

PluginAPI.registerConfigHandler(_estimatedFocusOpenSettings);

PluginAPI.onUnload(function () {
  _estimatedFocusEnabled = false;
  _estimatedFocusActiveTaskId = null;
  _estimatedFocusBlock = 0;
  _estimatedFocusBlockDurationMs = 0;
  _estimatedFocusTaskBlockCount = 0;
  _estimatedFocusRestartPending = false;
  if (_estimatedFocusAudioContext) {
    _estimatedFocusAudioContext.close();
    _estimatedFocusAudioContext = null;
  }
});

_estimatedFocusLoadConfig().then(function (config) {
  _estimatedFocusConfig = config;
});
