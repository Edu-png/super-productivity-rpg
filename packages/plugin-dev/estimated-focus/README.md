# Estimated Focus

Estimated Focus opens focus mode whenever time tracking starts. Every block uses
the active task's **Time Estimate** as its countdown duration.

For example, a task with a 50-minute estimate starts a `50:00` block. At each
boundary the plugin plays a three-tone alarm, starts the next block
automatically, and loops back to block 1 after the number of blocks configured
in the task.
It continues until task tracking is stopped.

In the task Duration dialog, enter the block length in the right-hand **Time
Estimate** field. The left-hand **Time Worked** field records work already done
and is not used as the block duration.

The task's **Number of focus blocks** field controls the cycle size. The
plugin's settings button under **Settings → Plugins** defines only the fallback
for older tasks that do not yet have a block count. The fallback is two.

## Requirements

- A Super Productivity build that allows `[FocusMode] Set Mode` and
  `[FocusMode] Start Session` through the plugin action bridge (the included
  development patch is based on 18.16.0)
- Focus mode enabled in Super Productivity

Before publishing the plugin, update `minSupVersion` to the first official
Super Productivity release that includes these API capabilities.

## Build

```bash
npm run build
```

Zip the contents of `dist` so that `manifest.json`, `plugin.js`, and `icon.svg`
are at the root of the archive. Upload that ZIP under **Settings → Plugins**.
