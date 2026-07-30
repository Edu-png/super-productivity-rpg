import {
  setFocusModeMode,
  startFocusSession,
} from '../features/focus-mode/store/focus-mode.actions';
import { FocusModeMode } from '../features/focus-mode/focus-mode.model';
import { isAllowedPluginAction } from './allowed-plugin-actions.const';

describe('allowed plugin actions', () => {
  it('allows plugins to start a focus session with a custom duration', () => {
    expect(
      isAllowedPluginAction(startFocusSession({ duration: 30 * 60 * 1000 })),
    ).toBeTrue();
  });

  it('allows plugins to select the countdown strategy', () => {
    expect(
      isAllowedPluginAction(setFocusModeMode({ mode: FocusModeMode.Countdown })),
    ).toBeTrue();
  });

  it('rejects unknown actions', () => {
    expect(isAllowedPluginAction({ type: '[Plugin Test] Unknown' })).toBeFalse();
  });
});
