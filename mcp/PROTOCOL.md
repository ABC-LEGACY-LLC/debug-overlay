# The wire, for a bridge that is not `mcp/index.js`

`mcp/index.js` is the reference server, but nothing about the extension
knows it. The extension speaks a small JSON protocol over one WebSocket, and
anything that speaks it is a valid far end — the first AI to drive this had
no Node on the machine and wrote the far end in PowerShell from reading
`sw.js`. That was a legitimate path, so here it is written down rather than
left to be reverse-engineered.

Everything is JSON text frames. `t` is the message type.

## Handshake — extension → server, first frame

```json
{ "t": "hello", "token": "<what the person typed>", "version": "3.8.196", "tab": 1682287786 }
```

The server answers ONE of:

```json
{ "t": "welcome", "version": "<server version, informational>" }
{ "t": "refused", "why": "wrong token" | "say hello first" | "this session already has a browser" }
```

After `refused` the server closes; the extension stops retrying and shows
`why` on the side panel. Compare the token in constant time — it is a secret,
however short.

## Keepalive — server → extension, every ~20 s

```json
{ "t": "ping" }        →   { "t": "pong" }
```

Not optional. Chrome stops an idle extension worker after ~30 s; traffic on
the socket is what keeps the session alive.

## Commands — server → extension → page → back

```json
{ "t": "call", "id": 7, "cmd": "state", "args": [] }
```

`id` is yours; it comes back unchanged. The extension forwards the command to
the bound tab's content script and answers:

```json
{ "t": "result", "id": 7, "ok": true,  "result": { … } }
{ "t": "result", "id": 7, "ok": false, "error": "…what happened, and what to do…" }
```

`result` is plain data — or a string, for `report`. An `error` is a sentence
meant for the reader: pass it through.

## The vocabulary — `cmd` and `args`

The page answers these (src/app/remote.js); an unknown `cmd` is refused with
the list.

| cmd | args | answers |
|---|---|---|
| `state` | `[]` | url, on, viewport, tools `[{id,title,armed,roles,family,band}]`, settings `[{owner,key,value,values|type…}]`, pins, swept |
| `power` | `[on]` | `{on}` |
| `arm` | `[id, on?]` | `{id, armed}` — omit `on` to toggle |
| `set` | `[owner, key, value]` | `{owner, key, value}` — refused with the allowed list if not offered |
| `pin` | `[selector]` | `{id, kind, selector, label, rect}` |
| `unpin` | `[number \| selector]` | `{removed, pins}` |
| `pins` | `[]` | `[{id, kind, selector, label, rect}]` |
| `click` | `[x, y, {shift?, ctrl?, meta?, alt?}]` | `{at, target, pins, current}` |
| `drag` | `[x1, y1, x2, y2]` | `{from, to, pins}` |
| `point` | `[x, y]` | `{at, target}` |
| `audit` | `[]` | `{swept, problems, occurrences, elements, findings:[…]}` — after the sweep finishes |
| `findings` | `[]` | the same, without sweeping |
| `report` | `[]` | the report text |
| `clear` | `[]` | `{pins: 0}` |

Coordinates are CSS pixels from the viewport's top-left. `rect` is
`{x, y, w, h}` in the same space.

## Failures you will meet

- **`the page in this tab does not answer …`** — the bound tab runs an
  overlay from before the AI door existed, or is a browser page that never
  carries one. Only the person can fix it: reload that tab. The side panel
  says the same thing on its status line.
- **`no tab bound …`** — the side panel has not told the worker which tab
  it is on yet; pressing Connect again binds it.
- **The extension keeps reconnecting** every 0.9–10 s while the address has
  no server. That is by design: start the server and it arrives.

## What the extension will never do

Connect anywhere the person did not type. Present a token they did not
type. Answer any command on a tab the side panel is not bound to. Send
anything but the frames above.
