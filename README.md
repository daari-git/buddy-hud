# Buddy HUD

A floating pixel buddy for [Claude Code](https://claude.com/claude-code). It sits on top of your windows and acts out what Claude is doing, so you can see it without watching the terminal.

> Unofficial community project. Not affiliated with or endorsed by Anthropic.

![preview](docs/preview.png)

[Watch the 40-second demo](docs/demo.mp4)

## What it does

- **The buddy reacts to the work.** Typing hands for edits and commands, eyes sweeping for reads, a swinging magnifier for searches, a hand on the head while thinking, a wave when Claude needs you, asleep when idle.
- **Live diffs.** See the file, the line number and the exact lines Claude is changing.
- **Context window.** A ring shows how full the context is.
- **Permissions.** Allow, Deny or "ask in terminal" from the overlay, with a desktop notification.
- **Replies.** When Claude stops, its last message appears in a bubble. Type back from the overlay (see [Replying](#replying)).
- **Multiple sessions.** One tab per Claude Code session.

Click the buddy for history and settings. Drag it anywhere.

## Install

Download the installer for your system from the Releases page:

| OS | File |
|---|---|
| Linux | `.AppImage` or `.deb` |
| macOS | `.dmg` |
| Windows | `.exe` installer or portable |

On first launch Buddy HUD asks to add its hooks to `~/.claude/settings.json` (a backup is saved as `settings.json.bak-buddy-hud`) and to start at login. Both are in the tray menu later.

### From source

```bash
git clone https://github.com/OWNER/buddy-hud && cd buddy-hud
npm install
npm start          # run the app
npm run hooks      # add the Claude Code hooks (npm run hooks:remove to undo)
```

Then restart any running Claude Code session.

## How it works

Claude Code [hooks](https://docs.claude.com/en/docs/claude-code/hooks) POST each event (tool use, prompt, stop, permission request) with `curl` to a server on `127.0.0.1:47800`. The Electron app turns those events into animation, diffs and bubbles. Nothing leaves your machine. The hooks need only `curl`, which ships with macOS, Linux and Windows 10+.

## Replying

- **Claude is working:** your message is queued and handed to Claude at its next step.
- **Claude is idle, inside tmux:** the text is typed straight into the pane.
- **Claude is idle, elsewhere:** the message is queued until Claude's next step. Start the next turn in the terminal.
- **Experimental:** turn on "hold turn-end" in settings and the Stop hook waits for your reply. The terminal then shows "hook running" until you answer or press skip.

## Platform notes

- **Linux:** runs through XWayland so it can stay on top under Wayland. Tested on Ubuntu 26.04 / GNOME.
- **macOS and Windows:** the code paths exist (tray, always-on-top, login item, packaging) but have **not been tested on real machines yet**. Please open an issue with what you see.
- On Windows, hooks run in the shell Claude Code uses. Git Bash is the best-supported setup because the hook reads `$TMUX`.

## Uninstall

Tray menu, "Remove Claude Code hooks", then quit and delete the app. Settings live in `~/.buddy-hud/`.

## Development

```bash
npm start            # run
npm run dist         # build installers for the current OS
npm run promo        # re-record the demo video (needs ffmpeg)
```

Layout: `main.js` (server, window, tray), `renderer/` (mascot SVG, CSS animations, UI), `install-hooks.js`, `promo/` (deterministic video recorder).

## License

MIT. The pixel mascot is a fan homage to the Claude Code logo; if Anthropic asks, it will be replaced.
