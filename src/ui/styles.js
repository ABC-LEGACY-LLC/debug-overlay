import { CONFIG } from '../core/config.js';
  /* ======================================================================
     STYLES
     ====================================================================== */
  // gap is 6, not 7: the pipeline bands added a fourth separator (~9px) and
  // the bar must not grow — one gap pixel across ~17 children pays for it
  // with change, and every button keeps its 34/36px target. (Comments stay
  // OUT of the template: this string ships to every page as a <style>.)
  export const CSS = `
    /* NAMESPACING DEFENDS THE CLASS AXIS ONLY. A host rule on a TAG or an
       attribute — Bootstrap Reboot's hr, Tailwind Preflight's svg, the usual
       input[type=checkbox] visually-hidden trick — matches our elements no
       matter what we call them, and an INHERITED property set on <html> flows
       straight into us: the root is a child of documentElement. Specificity is
       not the defence; declaring the property is. So the root stops every
       inherited property we rely on, and each element type below re-asserts
       what a host most commonly sets on it. */
    #__debug-overlay-root { position: fixed; inset: 0; z-index: ${CONFIG.Z}; pointer-events: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px; font-style: normal; font-variant: normal; font-weight: 400;
      line-height: normal; letter-spacing: normal; word-spacing: normal;
      text-transform: none; text-indent: 0; text-shadow: none; text-align: left;
      white-space: normal; direction: ltr; visibility: visible; float: none; }
    #__debug-overlay-root * { box-sizing: border-box; float: none; }
    /* form controls take their own tag rules — a host styling the button TAG reaches
       every button we draw, whatever we called it */
    #__debug-overlay-root button, #__debug-overlay-root input, #__debug-overlay-root select {
      margin: 0; text-transform: none; letter-spacing: normal;
      word-spacing: normal; text-indent: 0; }

    .debug-overlay-box { position: fixed; pointer-events: none; }
    .debug-overlay-hover  { outline: 1.5px solid #58c4ff; outline-offset: -1px; background: rgba(88,196,255,.06); }
    /* note pin = plain click (inspect only) · pair = Shift+click ·
       link = Ctrl/⌘+Shift+click, chained to the previous pin */
    .debug-overlay-pinbox { outline: 1.5px dashed #ff8a65; outline-offset: -1px; }
    .debug-overlay-pinbox.debug-overlay-pair { outline-style: solid; outline-color: #b5e853; }
    .debug-overlay-pinbox.debug-overlay-link { outline-style: solid; outline-color: #c084fc; }
    .debug-overlay-pinbox.debug-overlay-waiting { outline-color: #58c4ff; }
    .debug-overlay-pinbox.debug-overlay-rmtarget { outline: 2px solid #ff5c5c; background: rgba(255,92,92,.10); }
    .debug-overlay-pinbox.debug-overlay-flash { outline: 2.5px solid #58c4ff;
      background: rgba(88,196,255,.18); }
    @media (prefers-reduced-motion: no-preference) {
      .debug-overlay-pinbox.debug-overlay-flash { animation: debug-overlay-pulse .9s ease-out; }
    }
    @keyframes debug-overlay-pulse {
      0% { box-shadow: 0 0 0 0 rgba(88,196,255,.55); }
      100% { box-shadow: 0 0 0 16px rgba(88,196,255,0); } }

    /* pin list popover — opened from the count chip, closed for screenshots */
    /* the target menu — right-click's "what can you do with this element" */
    #__debug-overlay-menu { position: fixed; display: none; pointer-events: auto;
      min-width: 150px; background: rgba(18,18,20,.97); border-radius: 10px;
      padding: 4px; box-shadow: 0 6px 24px rgba(0,0,0,.6); color: #fff;
      font-size: 12px; }
    #__debug-overlay-menu.debug-overlay-open { display: block; }
    #__debug-overlay-menu button { display: block; width: 100%; text-align: left;
      padding: 7px 12px; background: transparent; border: 0; border-radius: 6px;
      color: inherit; font: inherit; cursor: pointer; }
    #__debug-overlay-menu button:hover { background: #3a3a41; }
    #__debug-overlay-list { position: fixed; display: none; pointer-events: auto;
      min-width: 250px; max-width: 460px; max-height: 60vh; overflow-y: auto;
      background: rgba(18,18,20,.97); border-radius: 12px; padding: 6px;
      box-shadow: 0 6px 24px rgba(0,0,0,.6); color: #fff; font-size: 12px; }
    #__debug-overlay-list.debug-overlay-open { display: block; }
    #__debug-overlay-list .debug-overlay-empty { padding: 10px 8px; color: #8f8f96; line-height: 1.5; }
    #__debug-overlay-list .debug-overlay-row { display: flex; align-items: center; gap: 8px;
      padding: 6px 8px; border-radius: 8px; }
    /* only a row that DOES something on click says so — a settings row is a
       label beside a control, and a pointer over it promised an action that
       never came */
    #__debug-overlay-list .debug-overlay-row[role="button"] { cursor: pointer; }
    #__debug-overlay-list .debug-overlay-row:hover { background: rgba(255,255,255,.08); }
    #__debug-overlay-list .debug-overlay-tag { flex: none; color: #ff8a65; font-weight: 800; }
    /* THE MESSAGE IS THE CONTENT AND MUST NOT BE THE CELL THAT COLLAPSES.
       .debug-overlay-lbl was the only shrinkable item in the row (every sibling is
       flex: none), and its overflow:hidden zeroes its automatic minimum size —
       so a long CSS selector in .debug-overlay-det ate the whole row and the finding
       rendered with NO TEXT AT ALL: measured 0px wide on 2 of 11 rows. The
       floor keeps the human-readable half; the machine-readable half is what
       truncates, with the whole of it in the row's title. */
    #__debug-overlay-list .debug-overlay-lbl { flex: 1 1 auto; min-width: 55%; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    #__debug-overlay-list .debug-overlay-det { flex: 0 1 auto; min-width: 0; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
      color: #b5e853; font-weight: 700; }
    /* A row may carry an opaque accent; the panel copies it onto the element
       without knowing what any of the values mean. */
    #__debug-overlay-list .debug-overlay-row[data-accent="error"] .debug-overlay-tag { color: #ff6b6b; }
    #__debug-overlay-list .debug-overlay-row[data-accent="warn"]  .debug-overlay-tag { color: #ffd54f; }
    #__debug-overlay-list .debug-overlay-row[data-accent="info"]  .debug-overlay-tag { color: #9ad0ff; }
    /* not a verdict — something the tool could not measure and you have to
       look at yourself; italic so it never reads as a failure */
    #__debug-overlay-list .debug-overlay-row[data-accent="review"] .debug-overlay-tag { color: #8ab4f8; font-style: italic; }
    /* The verdict reads first and the selector says where to look, so a
       finding puts its message in .debug-overlay-lbl — which already takes the room and
       ellipsises — and the element in .debug-overlay-det. No direction tricks: rtl reorders
       the neutral characters in a CSS selector and prints '#id' backwards. */
    #__debug-overlay-list .debug-overlay-row[data-accent] .debug-overlay-det { color: #8f8f96; font-weight: 400; }
    /* A settings row's picker. font: inherit because a bare <select> takes the
       PAGE's font on some sites and the row stops lining up; the overlay must
       look the same wherever it is injected. */
    #__debug-overlay-list .debug-overlay-opt { flex: none; cursor: pointer; font: inherit;
      background: #2c2c31; color: #b5e853; font-weight: 700; border: 0;
      border-radius: 6px; padding: 3px 6px;
      width: auto; height: auto; margin: 0; position: static;
      opacity: 1; appearance: auto; text-transform: none; }
    #__debug-overlay-list .debug-overlay-opt:hover { background: #3a3a41; }
    /* what the settings under it change — the category, not the owning tool */
    /* which of the three screens this is — one slot showed findings, pins and
       settings with no header at all, so nothing said what you were reading */
    #__debug-overlay-list .debug-overlay-viewhead { padding: 4px 8px 8px; color: #fff; font-size: 13px;
      font-weight: 800; border-bottom: 1px solid rgba(255,255,255,.10); margin-bottom: 4px; }
    #__debug-overlay-list .debug-overlay-viewhead .debug-overlay-rm { float: right; }
    #__debug-overlay-list .debug-overlay-viewhead .debug-overlay-note { display: block; margin-top: 2px; color: #8f8f96;
      font-size: 10px; font-weight: 400; }
    #__debug-overlay-list .debug-overlay-head { padding: 10px 8px 4px; color: #8f8f96;
      font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
    #__debug-overlay-list .debug-overlay-head:first-child { padding-top: 4px; }
    #__debug-overlay-list .debug-overlay-head .debug-overlay-note { display: block; margin-top: 2px;
      font-size: 10px; font-weight: 400; letter-spacing: 0; text-transform: none; }
    /* stored and waiting — the tool that reads it is switched off */
    /* .45 put the label at 2.53:1 against the popover — a permanent state,
       not a transient one, and unreadable in exactly the tool that ships a
       contrast checker. Dimmed enough to read as inactive, light enough to
       read at all. */
    #__debug-overlay-list .debug-overlay-row.debug-overlay-inert .debug-overlay-lbl, #__debug-overlay-list .debug-overlay-row.debug-overlay-inert .debug-overlay-tag { opacity: .7; }
    #__debug-overlay-list .debug-overlay-num { flex: none; display: flex; align-items: center; gap: 4px; }
    #__debug-overlay-list .debug-overlay-num .debug-overlay-opt { width: 68px; text-align: right; }
    #__debug-overlay-list .debug-overlay-unit { color: #8f8f96; font-weight: 400; }
    /* accent-color rather than a hand-built switch: the native control already
       knows focus, keyboard and the platform's own hit target */
    /* Declared, not defaulted: the common host pattern for hiding a native
       checkbox behind a custom one is input[type=checkbox]{position:absolute;
       opacity:0;width:1px}, and a TAG+ATTRIBUTE selector reaches straight past
       a class namespace. Unopposed is what loses, so this opposes it. */
    #__debug-overlay-list .debug-overlay-tick { width: 15px; height: 15px; padding: 0; margin: 0;
      position: static; opacity: 1; appearance: auto; accent-color: #b5e853; }
    /* the row's action, when it has one: the CONTENT is the button, so the
       row's ✕ stays a sibling and no interactive element nests in another */
    #__debug-overlay-list .debug-overlay-go { flex: 1 1 auto; min-width: 0; display: flex;
      align-items: center; gap: 8px; padding: 0; border: 0; background: none;
      color: inherit; font: inherit; text-align: left; cursor: pointer; }
    #__debug-overlay-list .debug-overlay-rm { flex: none; width: 20px; height: 20px; border: 0; cursor: pointer;
      border-radius: 50%; background: #2c2c31; color: #ff8a8a; font-size: 11px;
      display: flex; align-items: center; justify-content: center; }
    #__debug-overlay-list .debug-overlay-rm:hover { background: #ff5c5c; color: #fff; }
    /* Where the findings actually are. Dashed, never filled: a mark points at
       a problem, it must not hide the thing it is pointing at.
       CORE, not one tool's: every rule may mark its own findings, and this was
       contrast's private CSS until dupid needed to mark its own too. A class
       more than one tool emits cannot live in either one's sheet. */
    /* the badge's warn ink — CORE, because grid's lens and perf's pulse both
       emit it, and a class more than one tool emits cannot live in either
       one's sheet */
    .debug-overlay-badge .debug-overlay-warn { color: #ffd54f; }
    .debug-overlay-flag { outline-offset: 1px; }
    .debug-overlay-flag.debug-overlay-error  { outline: 2px dashed #ff6b6b; }
    .debug-overlay-flag.debug-overlay-warn   { outline: 2px dashed #ffd54f; }
    .debug-overlay-flag.debug-overlay-info   { outline: 2px dashed #9ad0ff; }
    .debug-overlay-flag.debug-overlay-review { outline: 2px dotted #8ab4f8; }
    /* WHAT is wrong, not only where. A dashed box names no rule, and no
       tooltip can ever say: this layer is aria-hidden and pointer-events:none,
       so a title attribute on a mark reaches nobody. So it is painted — the
       rule's own id, one label per element however many findings it drew. */
    .debug-overlay-tip { position: fixed; pointer-events: none; font-size: 9px;
      font-weight: 700; line-height: 12px; padding: 0 3px; border-radius: 3px;
      background: rgba(18,18,20,.92); white-space: nowrap; }
    .debug-overlay-tip.debug-overlay-error  { color: #ff6b6b; }
    .debug-overlay-tip.debug-overlay-warn   { color: #ffd54f; }
    .debug-overlay-tip.debug-overlay-info   { color: #9ad0ff; }
    .debug-overlay-tip.debug-overlay-review { color: #8ab4f8; font-style: italic; }
    /* an audit is on the page right now — distinct from .debug-overlay-armed, which only
       means the findings VIEW is the one open. No backticks in here: this
       whole sheet is a template literal. */
    #__debug-overlay-bar .debug-overlay-act.debug-overlay-swept { box-shadow: inset 0 0 0 2px #b5e853; }
    /* There was no designed focus indicator anywhere in this sheet — a
       keyboard user could tab through 13 controls with nothing to show where
       they were. :focus-visible only, so a mouse click does not draw one. */
    #__debug-overlay-root :focus-visible { outline: 2px solid #58c4ff; outline-offset: 2px; }
    /* WCAG 2.5.8 wants 24x24. These three were 18x21, 20x20 and 15x15. */
    #__debug-overlay-bar .debug-overlay-cnt { min-width: 24px; min-height: 24px; }
    #__debug-overlay-list .debug-overlay-rm { width: 24px; height: 24px; }
    #__debug-overlay-list .debug-overlay-tick { width: 24px; height: 24px; }
    #__debug-overlay-bar .debug-overlay-cnt.debug-overlay-armed { background: #ff8a65; color: #1a1a1a; }

    .debug-overlay-badge { position: fixed; pointer-events: none; max-width: 92vw;
      background: rgba(18,18,20,.94); color: #fff; border-radius: 8px;
      padding: 4px 9px; font-size: 12px; line-height: 1.45; white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0,0,0,.45); }
    .debug-overlay-badge .debug-overlay-sz  { color: #ffffff; font-weight: 700; }
    .debug-overlay-badge .debug-overlay-rad { color: #ff8a65; }
    .debug-overlay-badge .debug-overlay-sp  { color: #9ad0ff; }
    .debug-overlay-badge .debug-overlay-fnt { color: #d7c4ff; }
    .debug-overlay-badge .debug-overlay-tag { color: #8f8f96; }

    .debug-overlay-pin-num { position: fixed; pointer-events: none;
      min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px;
      background: #ff8a65; color: #1a1a1a; font-size: 12px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.5); }
    .debug-overlay-pin-num.debug-overlay-pair { background: #b5e853; color: #16200a; }
    .debug-overlay-pin-num.debug-overlay-link { background: #c084fc; color: #241333; }
    .debug-overlay-pin-num.debug-overlay-waiting { background: #58c4ff; color: #0d1b24; }
    .debug-overlay-pin-num.debug-overlay-rmtarget { background: #ff5c5c; color: #fff; }

    /* remove mode: ✕ chips appear only while the remove key is held */
    .debug-overlay-rmchip { position: fixed; pointer-events: none;
      width: 18px; height: 18px; border-radius: 50%; background: #ff5c5c; color: #fff;
      font-size: 11px; font-weight: 800; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,.5); transition: transform .1s ease; }
    .debug-overlay-rmchip.debug-overlay-target { transform: scale(1.3); background: #ff2f2f; }

    #__debug-overlay-bar { position: fixed; right: 14px; top: 50%;
      pointer-events: auto; display: flex; flex-direction: column; align-items: center;
      gap: 6px; background: rgba(18,18,20,.96); border-radius: 999px; padding: 8px;
      box-shadow: 0 4px 18px rgba(0,0,0,.55); user-select: none; touch-action: none;
      transition: transform .22s cubic-bezier(.2,.8,.3,1), opacity .22s ease; }
    #__debug-overlay-bar.debug-overlay-dragging { transition: none; opacity: .9; }
    #__debug-overlay-bar .debug-overlay-grip { width: 22px; height: 12px; cursor: grab; flex: none;
      display: flex; align-items: center; justify-content: center;
      color: #6a6a72; font-size: 11px; letter-spacing: 1px; line-height: 1; }
    #__debug-overlay-bar.debug-overlay-dragging .debug-overlay-grip { cursor: grabbing; }

    /* master power */
    #__debug-overlay-bar .debug-overlay-pwr { width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
      font-size: 15px; background: #3a3a40; color: #9a9aa2;
      display: flex; align-items: center; justify-content: center; transition: background .15s; }
    #__debug-overlay-bar.debug-overlay-on .debug-overlay-pwr { background: #b5e853; color: #1a1a1a; }
    /* a newer version exists — RESTS until updated, like every count that
       matters; amber because it asks for a decision, not because it burns */
    #__debug-overlay-bar .debug-overlay-pwr.debug-overlay-upd::after { content: ''; position: absolute;
      top: 1px; right: 1px; width: 9px; height: 9px; border-radius: 50%;
      background: #ffd54f; border: 2px solid #16161a; }
    #__debug-overlay-bar .debug-overlay-pwr { position: relative; }
    #__debug-overlay-bar .debug-overlay-st { font-size: 10px; font-weight: 800; letter-spacing: .5px; color: #8f8f96; }
    #__debug-overlay-bar.debug-overlay-on .debug-overlay-st { color: #b5e853; }
    #__debug-overlay-bar.debug-overlay-removing .debug-overlay-pwr { background: #ff5c5c; color: #fff; }
    #__debug-overlay-bar.debug-overlay-removing .debug-overlay-st { color: #ff5c5c; }

    /* docked: another surface (the extension's side panel) is presenting the
       panel's state, so the BAR steps aside — pins, marks and badges are the
       page's annotations and stay. display, not visibility: the bar must
       leave the tab order too, or Tab lands on invisible buttons. */
    #__debug-overlay-bar.debug-overlay-docked { display: none; }

    /* things that only make sense once powered on */
    #__debug-overlay-bar .debug-overlay-whenOn { display: none; }
    #__debug-overlay-bar.debug-overlay-on .debug-overlay-whenOn { display: flex; align-items: center; justify-content: center; }
    #__debug-overlay-bar.debug-overlay-on .debug-overlay-cnt.debug-overlay-whenOn { display: block; }
    /* the family flyout: the mark sits in the bar, the members slide out
       sideways — toward the open side of the screen, read off data-side */
    #__debug-overlay-bar .debug-overlay-fam, #__debug-overlay-bar .debug-overlay-fam-btn { display: none; }
    #__debug-overlay-bar.debug-overlay-on .debug-overlay-fam { position: relative; display: flex; }
    #__debug-overlay-bar.debug-overlay-on .debug-overlay-fam-btn { width: 34px; height: 34px; border-radius: 50%; border: 0;
      cursor: pointer; background: #2c2c31; color: #eaeaea; font-size: 15px;
      display: flex; align-items: center; justify-content: center; position: relative; }
    #__debug-overlay-bar .debug-overlay-fam-btn:hover { background: #3a3a41; }
    #__debug-overlay-bar .debug-overlay-fam-btn.debug-overlay-armed { background: #58c4ff; color: #10151a; }
    #__debug-overlay-bar .debug-overlay-fam-btn.debug-overlay-checks::after { content: ''; position: absolute;
      right: 1px; bottom: 1px; width: 7px; height: 7px; border-radius: 50%;
      background: #b5e853; border: 2px solid rgba(18,18,20,.96); }
    /* VERTICAL, like the bar it belongs to — the flyout is a short second
       column beside the head, not a sideways pill. And SEPARATED: no capsule
       background; each member is its own circle wearing its own shadow, the
       same species of button as the bar's. */
    #__debug-overlay-bar .debug-overlay-fam .debug-overlay-flyout { position: absolute; top: 50%;
      transform: translateY(-50%) scale(.9); display: flex;
      flex-direction: column; align-items: center; gap: 6px;
      opacity: 0; pointer-events: none;
      /* VISIBILITY, not just opacity: pointer-events stops the mouse but a
         transparent button keeps its place in the TAB ORDER, so four buttons
         nobody could see answered the keyboard. Delayed to the end of the fade
         so the transition still plays; inert is not an option here — that is
         the v3.8.48 defect, and jsdom implements neither its semantics nor
         display:none inheritance. */
      visibility: hidden;
      transition: opacity .15s ease, transform .15s ease, visibility 0s linear .15s; }
    #__debug-overlay-bar .debug-overlay-fam .debug-overlay-flyout button {
      box-shadow: 0 4px 14px rgba(0,0,0,.55); }
    /* the SECOND layer: a pressed axis grows its members one more step out
       from the bar, its own column beside the head — never mixed into the
       heads' column, or two levels read as one flat run */
    #__debug-overlay-bar .debug-overlay-fam .debug-overlay-flyout .debug-overlay-sub { position: relative; display: flex; }
    #__debug-overlay-bar .debug-overlay-fam .debug-overlay-flyout .debug-overlay-subfly { position: absolute; top: 50%;
      transform: translateY(-50%); display: flex; flex-direction: column;
      align-items: center; gap: 6px; }
    #__debug-overlay-bar[data-side="right"] .debug-overlay-fam .debug-overlay-flyout .debug-overlay-subfly { right: calc(100% + 12px); }
    #__debug-overlay-bar[data-side="left"] .debug-overlay-fam .debug-overlay-flyout .debug-overlay-subfly,
    #__debug-overlay-bar[data-side="top"] .debug-overlay-fam .debug-overlay-flyout .debug-overlay-subfly,
    #__debug-overlay-bar[data-side="bottom"] .debug-overlay-fam .debug-overlay-flyout .debug-overlay-subfly { left: calc(100% + 12px); }
    #__debug-overlay-bar .debug-overlay-fam.debug-overlay-open .debug-overlay-flyout { opacity: 1; pointer-events: auto;
      visibility: visible; transition-delay: 0s;
      transform: translateY(-50%) scale(1); }
    #__debug-overlay-bar[data-side="right"] .debug-overlay-fam .debug-overlay-flyout { right: calc(100% + 12px); }
    #__debug-overlay-bar[data-side="left"] .debug-overlay-fam .debug-overlay-flyout,
    #__debug-overlay-bar[data-side="top"] .debug-overlay-fam .debug-overlay-flyout,
    #__debug-overlay-bar[data-side="bottom"] .debug-overlay-fam .debug-overlay-flyout { left: calc(100% + 12px); }
    #__debug-overlay-bar hr.debug-overlay-sep { width: 20px; height: 1px; border: 0; margin: 1px 0;
      opacity: 1; overflow: visible; color: inherit;
      background: rgba(255,255,255,.14); }
    #__debug-overlay-bar .debug-overlay-cnt { font-size: 11px; font-weight: 700; color: #ff8a65;
      border: 0; background: transparent; cursor: pointer; padding: 2px 6px;
      border-radius: 999px; font-family: inherit; }
    #__debug-overlay-bar .debug-overlay-cnt:hover { background: #2c2c31; }
    /* ARMED WINS OVER HOVER. The armed chip is dark text on amber; this hover
       rule is declared later at equal specificity, so it replaced the amber
       with #2c2c31 and left the dark text — #1a1a1a on #2c2c31 is 1.25:1, an
       empty-looking circle exactly while its own list is open, and you are
       always hovering the chip you just clicked. In a tool that ships a
       contrast checker. */
    #__debug-overlay-bar .debug-overlay-cnt.debug-overlay-armed:hover { background: #ff8a65; }

    /* tool + action buttons */
    #__debug-overlay-bar button.debug-overlay-tool, #__debug-overlay-bar button.debug-overlay-act, #__debug-overlay-bar button.debug-overlay-bctl {
      width: 34px; height: 34px; border-radius: 50%; border: 0; cursor: pointer;
      background: #2c2c31; color: #fff; font-size: 15px; }
    /* NO display here: .debug-overlay-whenOn owns display (none ↔ flex with centring), and
       a more specific display on the buttons out-guns the hider — the exact
       mistake the fam flyout already made once. One icon set (lucide, ISC),
       one size; the .debug-overlay-whenOn / .debug-overlay-pwr / .debug-overlay-fam-btn flex does the centring. */
    /* every svg we own, not just the bar's: Preflight sets display on the
       TAG, so a rule scoped to one container leaves the rest of them to it */
    #__debug-overlay-root svg { display: inline-block; vertical-align: middle; }
    #__debug-overlay-bar button svg { width: 16px; height: 16px; pointer-events: none; }
    #__debug-overlay-bar .debug-overlay-grip svg { width: 14px; height: 14px; display: block; }
    #__debug-overlay-list .debug-overlay-tag svg { width: 14px; height: 14px; vertical-align: -3px; }
    #__debug-overlay-bar button.debug-overlay-tool:hover, #__debug-overlay-bar button.debug-overlay-act:hover { background: #3a3a40; }
    #__debug-overlay-bar button.debug-overlay-tool.debug-overlay-armed,
    #__debug-overlay-bar button.debug-overlay-bctl.debug-overlay-armed { background: #58c4ff; color: #0d1b24; }
    /* an OPEN axis head is a drawer pulled out, not a value in force —
       a ring, not the armed fill, so the two states cannot be confused */
    #__debug-overlay-bar button.debug-overlay-bctl.debug-overlay-axis.debug-overlay-open { box-shadow: inset 0 0 0 2px #58c4ff; }
    /* a fixed member is information: always on, takes no click */
    #__debug-overlay-bar button.debug-overlay-bctl.debug-overlay-fixed { opacity: .55; cursor: default; }
    /* A tool in the run that feeds ⌕ carries a dot. Armed or not, it is still
       swept — the dot says "this contributes findings", the fill says "this
       is drawn". They are different questions and used to look the same. */
    #__debug-overlay-bar button.debug-overlay-tool.debug-overlay-checks { position: relative; }
    #__debug-overlay-bar button.debug-overlay-tool.debug-overlay-checks::after {
      content: ''; position: absolute; right: 2px; bottom: 2px;
      width: 4px; height: 4px; border-radius: 50%; background: #b5e853; }
    #__debug-overlay-bar button.debug-overlay-act.debug-overlay-armed { background: #b5e853; color: #1a1a1a; }

    #__debug-overlay-bar.debug-overlay-tucked { opacity: .4; }
    #__debug-overlay-bar.debug-overlay-tucked:hover { opacity: 1; }
  `;
