# debug-overlay MCP — let an AI drive the overlay

One session, one token, one browser. Claude Code starts this server over
stdio; the Debug Overlay extension dials in from its side panel with the
token; every tool call is then a command to that browser's current tab,
answered with the same data the panel shows a person — and `report` returns
exactly the text ⧉ copies.

Nothing to install: `node mcp/` runs from a clone. Node 22 or newer.

## Set up, once

**1. Tell Claude Code about the server.** In the project where the AI works
(not necessarily this repo):

```bash
claude mcp add debug-overlay -- node /path/to/debug-overlay/mcp/
```

or in that project's `.mcp.json`:

```json
{ "mcpServers": { "debug-overlay": { "command": "node", "args": ["/path/to/debug-overlay/mcp/"] } } }
```

Optional environment: `DEBUG_OVERLAY_PORT` (default `8787`) and
`DEBUG_OVERLAY_TOKEN` (default: generated at start). Set the token yourself
if you would rather type the same one every time.

**2. Connect the browser.** When the session starts, the server prints its
address and token to stderr; the AI can also read them with the `session`
tool and tell you. In Chrome, open the Debug Overlay **side panel** on the
page you want examined, scroll to **AI session**, enter the address and
token, press **Connect**. The status line says when the AI is in.

Keep the side panel open while the session runs — it is what remembers the
session if Chrome stops the extension's worker.

## If Claude Code runs on another machine

That is the arrangement this was built for. The server binds to
`127.0.0.1` on the machine Claude Code runs on; the browser has to reach
that port:

- **VSCode Remote-SSH** forwards it automatically — it notices the listening
  port and offers it in the *Ports* panel. The extension then connects to
  `ws://localhost:8787` on your own machine.
- **Plain SSH:** `ssh -L 8787:localhost:8787 <server>`.

Two people, two machines: two Claude Code sessions, each with its own
process on its own port (`DEBUG_OVERLAY_PORT=8788`) and its own token. A
browser presents one token and reaches one process; there is no relay for a
session to cross into another's.

## What the AI can do

| tool | is |
|---|---|
| `session` | is a browser connected; if not, the address and token to give the person |
| `state` | url, power, every tool (id, armed, roles), every setting (owner, key, value, allowed values), pin count — **call first** |
| `power`, `arm`, `set` | the ⏻ button, a tool button, a ⚙ row |
| `pin`, `unpin`, `pins` | pins by CSS selector — reaches what a click cannot |
| `click`, `drag`, `point` | the hand: a click with modifiers, a press-drag-release, a pointer move |
| `audit`, `findings` | ⌕, awaited; and the last result |
| `report` | the text ⧉ copies — the deliverable |
| `clear` | ✕ |

The gestures name no tool. `drag` with the lasso armed pins a box; `point`
with paint armed probes a pixel; a tool shipped tomorrow is driven the day
it lands, because the AI learns the ids from `state` the way a person learns
them from the bar.

## What it cannot do, on purpose

- **Reach a browser that did not type the token.** The extension connects
  out only when a person presses Connect; nothing here connects in.
- **See anything but the overlay's API.** No screenshots, no DOM dumps, no
  other tabs. The `report` is what it gets, and the report is designed to be
  enough.
- **Take the real-pixel sample by itself.** ⛏ paint's screen capture needs
  Chrome's `activeTab` grant, which only the toolbar button gives — a person
  presses it, the report then carries the sample. The report says so when it
  could not.
