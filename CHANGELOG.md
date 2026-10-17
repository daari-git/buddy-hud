# Changelog

## 0.1.2

- Removed the in-app model switcher: Claude Code cannot be driven reliably from outside, so it never matched the terminal. The buddy still shows and tints to the model actually in use.

## 0.1.1

- Model picker lists every version per family, like `/model`, with a 1M toggle; fixes wrong version labels and false "in use" marks.
- Fixed clicks being swallowed by re-renders, scroll resets, and missing slim scrollbars.
- AskUserQuestion and plan approval are no longer shown as Allow/Deny; the buddy asks and the terminal answers.
- Hide stays hidden until a new session or a permission request; stale sessions are pruned; Esc closes menus.

## 0.1.0

- Animated pixel buddy reacting to tool use: typing, reading, searching, thinking, waiting for you, asleep.
- Live diffs with line numbers, permission Allow/Deny from the overlay, context ring, multi-session tabs.
- Colour theme follows the model in use (Fable, Opus, Sonnet, Haiku).
- Unique file counts (read / edited) always visible, with file lists in details.
- Claude's replies render markdown. Privacy mode, size setting, remembered position.
- Curl-based hooks (no Node needed), tray menu, start at login, first-run connect prompt.
- Linux, macOS and Windows packaging via electron-builder (macOS and Windows untested).
