# Buddy HUD roadmap (ticked when done)

## 1. Make it trustworthy
- [x] 1a Health indicator: hooks connected / waiting / stale, visible in the UI
- [x] 1b Self-test (tray + details): sends a test event through the real curl hook and reports pass/fail
- [x] 1c Code audit pass, fix what it finds
- [x] 1d End-to-end test: hook events in -> state out (runs in CI)
- [x] 1e macOS / Windows: CI build matrix + tester issue template (workflows written; I could not run them or a Mac/Windows GUI from here)

## 2. Alerts that earn their place
- [x] 2a Sound + notification on finish / permission, per-event toggles, do-not-disturb
- [x] 2b "Seems stuck" detection
- [x] 2c Elapsed time of the current task

## 3. Cost and limits
- [x] 3a Token totals per session from the transcript (deduped)
- [x] 3b Estimated cost where prices are known, tokens only otherwise
- [x] 3c Context-nearly-full warning
- [x] 3d Daily total

## 4. Review what happened
- [x] 4a Click a file to open it
- [x] 4b "While you were away" summary
- [x] 4c Full diff view

## 5. If demand is real
- [x] 5a Phone approvals over LAN (opt-in, token protected; tested over HTTP only, not on a real phone)
- [x] 5b Skins, including an original (non-logo) character
