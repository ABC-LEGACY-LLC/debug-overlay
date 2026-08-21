/* ======================================================================
  PROTOCOL — the bar's contract, made transportable.

     The panel's standing rule is "self-contained; talks out only via
     callbacks": the controller calls Panel.setCount(3) and never learns
     what renders it; the panel fires onTool('grid') and never learns
     what arming means. That contract IS the wire protocol — the cockpit
     (the extension's side-panel face) implements the same names over
     chrome.runtime messages, so core changes not at all.

     This module is PURE and shared by BOTH bundles (the content script
     and the cockpit import it), which is why it lives in core and
     imports nothing: it is the one vocabulary two programs must agree
     on, and a copy in each would agree until it quietly did not.

     Everything here must survive structured clone. Rows are packed by
     WHITELIST — live elements, pin objects, tool references and
     onChange closures stay behind, and activation travels as the row's
     INDEX, resolved against rows(view) on the content side: the same
     row-index law the in-page list already lives by ("every callback
     must resolve against rows(view)"), now doing the job it was
     written for.
   ====================================================================== */

/** Bumped when a message shape changes. A cockpit and a content script
 *  from different versions refuse each other loudly instead of half
 *  working — the two bundles ship together, so this only bites when a
 *  page has not been refreshed across an update. */
export const PROTOCOL_VERSION = 1;

/* STATE pushes: content script → cockpit. Names mirror the Panel api the
   controller already calls; args are what that api takes, packed. */
const STATE = {
        on: null,                 // (bool)
        tools: null,              // (roster: [{id, icon, title, fam, roles}], coreVersion) — on hello
        tool: null,               // (id, armed)
        count: null,              // (n)
        swept: null,              // (showing, n)
        removeMode: null,         // (bool)
        update: null,             // (version)
        flash: null,              // (msg, sel)
        badgeControls: (groups) => [groups.map(packBadgeGroup)],
        rows: (view, rows, empty) => [view, rows.map(packRow), empty],
        events: null,             // (toolId, events[], isBacklog) — timeline entries, plain data;
                                  // a backlog REPLACES that tool's entries for this page visit
        bye: null,                // the page is unloading — expect a reconnect
};

/* COMMANDS: cockpit → content script. Names mirror the Panel callbacks. */
const CMD = {
        toggle: null,             // power
        tool: null,               // (id) arm/disarm
        sweep: null,
        copy: null,
        clear: null,
        badgeControl: null,       // (key)
        updateCheck: null,        // (force)
        updateApply: null,
        openView: null,           // (view) — compute and push that view's rows
        rowActivate: null,        // (view, i)
        rowRemove: null,          // (view, i)
        rowChange: null,          // (view, i, raw)
        hello: null,              // a cockpit connected — push everything
};

/** One list row, flattened to what a renderer needs and nothing it must
 *  not have. `control` descriptors (kind/choices/value/…) are already
 *  plain data. `pins` collapses to a count — the index is the identity. */
export function packRow(row) {
        const out = {};
        for (const k of ['title', 'heading', 'detail', 'tag', 'label',
                         'accent', 'inert', 'removable', 'rmTitle',
                         'activatable', 'control']) {
          if (row[k] !== undefined) out[k] = row[k];
        }
        if (row.pins) out.pinCount = row.pins.length;
        return out;
}

function packBadgeGroup(g) {
        return { key: g.key, glyph: g.glyph, title: g.title,
                 rows: (g.rows || []).map((r) => ({
                   key: r.key, glyph: r.glyph, title: r.title, label: r.label,
                   armed: !!r.armed, fixed: !!r.fixed })) };
}

function envelope(kind, table, name, args) {
        if (!(name in table)) throw new Error(`unknown ${kind}: ${name}`);
        const pack = table[name];
        return { dbgov: PROTOCOL_VERSION, kind,
                 name, args: pack ? pack(...args) : args };
}

export const Protocol = {
        /** Build a state-push message. */
        state: (name, ...args) => envelope('state', STATE, name, args),
        /** Build a command message. */
        cmd: (name, ...args) => envelope('cmd', CMD, name, args),
        /**
         * Read a message from the wire. Returns { kind, name, args } for a
         * valid message of OUR protocol, and null for everything else —
         * the extension's worker traffic (debug-overlay-fetch and friends)
         * and any other extension's noise pass through untouched.
         */
        read(msg) {
          if (!msg || msg.dbgov !== PROTOCOL_VERSION) return null;
          const table = msg.kind === 'state' ? STATE : msg.kind === 'cmd' ? CMD : null;
          if (!table || !(msg.name in table) || !Array.isArray(msg.args)) return null;
          return { kind: msg.kind, name: msg.name, args: msg.args };
        },
        /** A different-version message of ours — worth telling the user
         *  "refresh this page" instead of silently ignoring. */
        stale: (msg) => !!msg && typeof msg.dbgov === 'number' &&
                        msg.dbgov !== PROTOCOL_VERSION,
};
