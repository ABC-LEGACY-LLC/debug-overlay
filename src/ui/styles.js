import { CONFIG } from '../core/config.js';
  /* ======================================================================
     STYLES
     ====================================================================== */
  // gap is 6, not 7: the pipeline bands added a fourth separator (~9px) and
  // the bar must not grow — one gap pixel across ~17 children pays for it
  // with change, and every button keeps its 34/36px target. (Comments stay
  // OUT of the template: this string ships to every page as a <style>.)
  export const CSS = `
    #__dbgov-root { position: fixed; inset: 0; z-index: ${CONFIG.Z}; pointer-events: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    #__dbgov-root * { box-sizing: border-box; }

    .dbgov-box { position: fixed; pointer-events: none; }
    .dbgov-hover  { outline: 1.5px solid #58c4ff; outline-offset: -1px; background: rgba(88,196,255,.06); }
    /* note pin = plain click (inspect only) · pair = Shift+click ·
       link = Ctrl/⌘+Shift+click, chained to the previous pin */
    .dbgov-pinbox { outline: 1.5px dashed #ff8a65; outline-offset: -1px; }
    .dbgov-pinbox.dbgov-pair { outline-style: solid; outline-color: #b5e853; }
    .dbgov-pinbox.dbgov-link { outline-style: solid; outline-color: #c084fc; }
    .dbgov-pinbox.dbgov-waiting { outline-color: #58c4ff; }
    .dbgov-pinbox.dbgov-rmtarget { outline: 2px solid #ff5c5c; background: rgba(255,92,92,.10); }
    .dbgov-pinbox.dbgov-flash { outline: 2.5px solid #58c4ff;
      background: rgba(88,196,255,.18); }
    @media (prefers-reduced-motion: no-preference) {
      .dbgov-pinbox.dbgov-flash { animation: dbgov-pulse .9s ease-out; }
    }
    @keyframes dbgov-pulse {
      0% { box-shadow: 0 0 0 0 rgba(88,196,255,.55); }
      100% { box-shadow: 0 0 0 16px rgba(88,196,255,0); } }

    /* pin list popover — opened from the count chip, closed for screenshots */
    /* the target menu — right-click's "what can you do with this element" */
    #__dbgov-menu { position: fixed; display: none; pointer-events: auto;
      min-width: 150px; background: rgba(18,18,20,.97); border-radius: 10px;
      padding: 4px; box-shadow: 0 6px 24px rgba(0,0,0,.6); color: #fff;
      font-size: 12px; }
    #__dbgov-menu.dbgov-open { display: block; }
    #__dbgov-menu button { display: block; width: 100%; text-align: left;
      padding: 7px 12px; background: transparent; border: 0; border-radius: 6px;
      color: inherit; font: inherit; cursor: pointer; }
    #__dbgov-menu button:hover { background: #3a3a41; }
    #__dbgov-list { position: fixed; display: none; pointer-events: auto;
      min-width: 250px; max-width: 460px; max-height: 60vh; overflow-y: auto;
      background: rgba(18,18,20,.97); border-radius: 12px; padding: 6px;
      box-shadow: 0 6px 24px rgba(0,0,0,.6); color: #fff; font-size: 12px; }
    #__dbgov-list.dbgov-open { display: block; }
    #__dbgov-list .dbgov-empty { padding: 10px 8px; color: #8f8f96; line-height: 1.5; }
    #__dbgov-list .dbgov-row { display: flex; align-items: center; gap: 8px;
      padding: 6px 8px; border-radius: 8px; cursor: pointer; }
    #__dbgov-list .dbgov-row:hover { background: rgba(255,255,255,.08); }
    #__dbgov-list .dbgov-tag { flex: none; color: #ff8a65; font-weight: 800; }
    #__dbgov-list .dbgov-lbl { flex: 1 1 auto; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap; }
    #__dbgov-list .dbgov-det { flex: none; color: #b5e853; font-weight: 700; }
    /* A row may carry an opaque accent; the panel copies it onto the element
       without knowing what any of the values mean. */
    #__dbgov-list .dbgov-row[data-accent="error"] .dbgov-tag { color: #ff6b6b; }
    #__dbgov-list .dbgov-row[data-accent="warn"]  .dbgov-tag { color: #ffd54f; }
    #__dbgov-list .dbgov-row[data-accent="info"]  .dbgov-tag { color: #9ad0ff; }
    /* not a verdict — something the tool could not measure and you have to
       look at yourself; italic so it never reads as a failure */
    #__dbgov-list .dbgov-row[data-accent="review"] .dbgov-tag { color: #8ab4f8; font-style: italic; }
    /* The verdict reads first and the selector says where to look, so a
       finding puts its message in .dbgov-lbl — which already takes the room and
       ellipsises — and the element in .dbgov-det. No direction tricks: rtl reorders
       the neutral characters in a CSS selector and prints '#id' backwards. */
    #__dbgov-list .dbgov-row[data-accent] .dbgov-det { color: #8f8f96; font-weight: 400; }
    /* A settings row's picker. font: inherit because a bare <select> takes the
       PAGE's font on some sites and the row stops lining up; the overlay must
       look the same wherever it is injected. */
    #__dbgov-list .dbgov-opt { flex: none; cursor: pointer; font: inherit;
      background: #2c2c31; color: #b5e853; font-weight: 700; border: 0;
      border-radius: 6px; padding: 3px 6px; }
    #__dbgov-list .dbgov-opt:hover { background: #3a3a41; }
    /* what the settings under it change — the category, not the owning tool */
    /* which of the three screens this is — one slot showed findings, pins and
       settings with no header at all, so nothing said what you were reading */
    #__dbgov-list .dbgov-viewhead { padding: 4px 8px 8px; color: #fff; font-size: 13px;
      font-weight: 800; border-bottom: 1px solid rgba(255,255,255,.10); margin-bottom: 4px; }
    #__dbgov-list .dbgov-viewhead .dbgov-rm { float: right; }
    #__dbgov-list .dbgov-viewhead .dbgov-note { display: block; margin-top: 2px; color: #8f8f96;
      font-size: 10px; font-weight: 400; }
    #__dbgov-list .dbgov-head { padding: 10px 8px 4px; color: #8f8f96;
      font-size: 10px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase; }
    #__dbgov-list .dbgov-head:first-child { padding-top: 4px; }
    #__dbgov-list .dbgov-head .dbgov-note { display: block; margin-top: 2px;
      font-size: 10px; font-weight: 400; letter-spacing: 0; text-transform: none; }
    /* stored and waiting — the tool that reads it is switched off */
    #__dbgov-list .dbgov-row.dbgov-inert .dbgov-lbl, #__dbgov-list .dbgov-row.dbgov-inert .dbgov-tag { opacity: .45; }
    #__dbgov-list .dbgov-num { flex: none; display: flex; align-items: center; gap: 4px; }
    #__dbgov-list .dbgov-num .dbgov-opt { width: 68px; text-align: right; }
    #__dbgov-list .dbgov-unit { color: #8f8f96; font-weight: 400; }
    /* accent-color rather than a hand-built switch: the native control already
       knows focus, keyboard and the platform's own hit target */
    #__dbgov-list .dbgov-tick { width: 15px; height: 15px; padding: 0; accent-color: #b5e853; }
    #__dbgov-list .dbgov-rm { flex: none; width: 20px; height: 20px; border: 0; cursor: pointer;
      border-radius: 50%; background: #2c2c31; color: #ff8a8a; font-size: 11px;
      display: flex; align-items: center; justify-content: center; }
    #__dbgov-list .dbgov-rm:hover { background: #ff5c5c; color: #fff; }
    /* Where the findings actually are. Dashed, never filled: a mark points at
       a problem, it must not hide the thing it is pointing at.
       CORE, not one tool's: every rule may mark its own findings, and this was
       contrast's private CSS until dupid needed to mark its own too. A class
       more than one tool emits cannot live in either one's sheet. */
    .dbgov-flag { outline-offset: 1px; }
    .dbgov-flag.dbgov-error  { outline: 2px dashed #ff6b6b; }
    .dbgov-flag.dbgov-warn   { outline: 2px dashed #ffd54f; }
    .dbgov-flag.dbgov-info   { outline: 2px dashed #9ad0ff; }
    .dbgov-flag.dbgov-review { outline: 2px dotted #8ab4f8; }
    /* an audit is on the page right now — distinct from .dbgov-armed, which only
       means the findings VIEW is the one open. No backticks in here: this
       whole sheet is a template literal. */
    #__dbgov-bar .dbgov-act.dbgov-swept { box-shadow: inset 0 0 0 2px #b5e853; }
    /* There was no designed focus indicator anywhere in this sheet — a
       keyboard user could tab through 13 controls with nothing to show where
       they were. :focus-visible only, so a mouse click does not draw one. */
    #__dbgov-root :focus-visible { outline: 2px solid #58c4ff; outline-offset: 2px; }
    /* WCAG 2.5.8 wants 24x24. These three were 18x21, 20x20 and 15x15. */
    #__dbgov-bar .dbgov-cnt { min-width: 24px; min-height: 24px; }
    #__dbgov-list .dbgov-rm { width: 24px; height: 24px; }
    #__dbgov-list .dbgov-tick { width: 24px; height: 24px; }
    #__dbgov-bar .dbgov-cnt.dbgov-armed { background: #ff8a65; color: #1a1a1a; }

    .dbgov-badge { position: fixed; pointer-events: none; max-width: 92vw;
      background: rgba(18,18,20,.94); color: #fff; border-radius: 8px;
      padding: 4px 9px; font-size: 12px; line-height: 1.45; white-space: nowrap;
      box-shadow: 0 2px 10px rgba(0,0,0,.45); }
    .dbgov-badge .dbgov-sz  { color: #ffffff; font-weight: 700; }
    .dbgov-badge .dbgov-rad { color: #ff8a65; }
    .dbgov-badge .dbgov-sp  { color: #9ad0ff; }
    .dbgov-badge .dbgov-fnt { color: #d7c4ff; }
    .dbgov-badge .dbgov-tag { color: #8f8f96; }

    .dbgov-pin-num { position: fixed; pointer-events: none;
      min-width: 22px; height: 22px; padding: 0 5px; border-radius: 11px;
      background: #ff8a65; color: #1a1a1a; font-size: 12px; font-weight: 800;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 8px rgba(0,0,0,.5); }
    .dbgov-pin-num.dbgov-pair { background: #b5e853; color: #16200a; }
    .dbgov-pin-num.dbgov-link { background: #c084fc; color: #241333; }
    .dbgov-pin-num.dbgov-waiting { background: #58c4ff; color: #0d1b24; }
    .dbgov-pin-num.dbgov-rmtarget { background: #ff5c5c; color: #fff; }

    /* remove mode: ✕ chips appear only while the remove key is held */
    .dbgov-rm { position: fixed; pointer-events: none;
      width: 18px; height: 18px; border-radius: 50%; background: #ff5c5c; color: #fff;
      font-size: 11px; font-weight: 800; line-height: 1;
      display: flex; align-items: center; justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,.5); transition: transform .1s ease; }
    .dbgov-rm.dbgov-target { transform: scale(1.3); background: #ff2f2f; }

    #__dbgov-bar { position: fixed; right: 14px; top: 50%;
      pointer-events: auto; display: flex; flex-direction: column; align-items: center;
      gap: 6px; background: rgba(18,18,20,.96); border-radius: 999px; padding: 8px;
      box-shadow: 0 4px 18px rgba(0,0,0,.55); user-select: none; touch-action: none;
      transition: transform .22s cubic-bezier(.2,.8,.3,1), opacity .22s ease; }
    #__dbgov-bar.dbgov-dragging { transition: none; opacity: .9; }
    #__dbgov-bar .dbgov-grip { width: 22px; height: 12px; cursor: grab; flex: none;
      display: flex; align-items: center; justify-content: center;
      color: #6a6a72; font-size: 11px; letter-spacing: 1px; line-height: 1; }
    #__dbgov-bar.dbgov-dragging .dbgov-grip { cursor: grabbing; }

    /* master power */
    #__dbgov-bar .dbgov-pwr { width: 36px; height: 36px; border-radius: 50%; border: 0; cursor: pointer;
      font-size: 15px; background: #3a3a40; color: #9a9aa2;
      display: flex; align-items: center; justify-content: center; transition: background .15s; }
    #__dbgov-bar.dbgov-on .dbgov-pwr { background: #b5e853; color: #1a1a1a; }
    #__dbgov-bar .dbgov-st { font-size: 10px; font-weight: 800; letter-spacing: .5px; color: #8f8f96; }
    #__dbgov-bar.dbgov-on .dbgov-st { color: #b5e853; }
    #__dbgov-bar.dbgov-removing .dbgov-pwr { background: #ff5c5c; color: #fff; }
    #__dbgov-bar.dbgov-removing .dbgov-st { color: #ff5c5c; }

    /* things that only make sense once powered on */
    #__dbgov-bar .dbgov-whenOn { display: none; }
    #__dbgov-bar.dbgov-on .dbgov-whenOn { display: flex; align-items: center; justify-content: center; }
    #__dbgov-bar.dbgov-on .dbgov-cnt.dbgov-whenOn { display: block; }
    /* the family flyout: the mark sits in the bar, the members slide out
       sideways — toward the open side of the screen, read off data-side */
    #__dbgov-bar .dbgov-fam, #__dbgov-bar .dbgov-fam-btn { display: none; }
    #__dbgov-bar.dbgov-on .dbgov-fam { position: relative; display: flex; }
    #__dbgov-bar.dbgov-on .dbgov-fam-btn { width: 34px; height: 34px; border-radius: 50%; border: 0;
      cursor: pointer; background: #2c2c31; color: #eaeaea; font-size: 15px;
      display: flex; align-items: center; justify-content: center; position: relative; }
    #__dbgov-bar .dbgov-fam-btn:hover { background: #3a3a41; }
    #__dbgov-bar .dbgov-fam-btn.dbgov-armed { background: #58c4ff; color: #10151a; }
    #__dbgov-bar .dbgov-fam-btn.dbgov-checks::after { content: ''; position: absolute;
      right: 1px; bottom: 1px; width: 7px; height: 7px; border-radius: 50%;
      background: #b5e853; border: 2px solid rgba(18,18,20,.96); }
    /* VERTICAL, like the bar it belongs to — the flyout is a short second
       column beside the head, not a sideways pill. And SEPARATED: no capsule
       background; each member is its own circle wearing its own shadow, the
       same species of button as the bar's. */
    #__dbgov-bar .dbgov-fam .dbgov-flyout { position: absolute; top: 50%;
      transform: translateY(-50%) scale(.9); display: flex;
      flex-direction: column; align-items: center; gap: 6px;
      opacity: 0; pointer-events: none;
      transition: opacity .15s ease, transform .15s ease; }
    #__dbgov-bar .dbgov-fam .dbgov-flyout button {
      box-shadow: 0 4px 14px rgba(0,0,0,.55); }
    /* the SECOND layer: a pressed axis grows its members one more step out
       from the bar, its own column beside the head — never mixed into the
       heads' column, or two levels read as one flat run */
    #__dbgov-bar .dbgov-fam .dbgov-flyout .dbgov-sub { position: relative; display: flex; }
    #__dbgov-bar .dbgov-fam .dbgov-flyout .dbgov-subfly { position: absolute; top: 50%;
      transform: translateY(-50%); display: flex; flex-direction: column;
      align-items: center; gap: 6px; }
    #__dbgov-bar[data-side="right"] .dbgov-fam .dbgov-flyout .dbgov-subfly { right: calc(100% + 12px); }
    #__dbgov-bar[data-side="left"] .dbgov-fam .dbgov-flyout .dbgov-subfly,
    #__dbgov-bar[data-side="top"] .dbgov-fam .dbgov-flyout .dbgov-subfly,
    #__dbgov-bar[data-side="bottom"] .dbgov-fam .dbgov-flyout .dbgov-subfly { left: calc(100% + 12px); }
    #__dbgov-bar .dbgov-fam.dbgov-open .dbgov-flyout { opacity: 1; pointer-events: auto;
      transform: translateY(-50%) scale(1); }
    #__dbgov-bar[data-side="right"] .dbgov-fam .dbgov-flyout { right: calc(100% + 12px); }
    #__dbgov-bar[data-side="left"] .dbgov-fam .dbgov-flyout,
    #__dbgov-bar[data-side="top"] .dbgov-fam .dbgov-flyout,
    #__dbgov-bar[data-side="bottom"] .dbgov-fam .dbgov-flyout { left: calc(100% + 12px); }
    #__dbgov-bar hr.dbgov-sep { width: 20px; height: 1px; border: 0; margin: 1px 0;
      background: rgba(255,255,255,.14); }
    #__dbgov-bar .dbgov-cnt { font-size: 11px; font-weight: 700; color: #ff8a65;
      border: 0; background: transparent; cursor: pointer; padding: 2px 6px;
      border-radius: 999px; font-family: inherit; }
    #__dbgov-bar .dbgov-cnt:hover { background: #2c2c31; }

    /* tool + action buttons */
    #__dbgov-bar button.dbgov-tool, #__dbgov-bar button.dbgov-act, #__dbgov-bar button.dbgov-bctl {
      width: 34px; height: 34px; border-radius: 50%; border: 0; cursor: pointer;
      background: #2c2c31; color: #fff; font-size: 15px; }
    /* NO display here: .dbgov-whenOn owns display (none ↔ flex with centring), and
       a more specific display on the buttons out-guns the hider — the exact
       mistake the fam flyout already made once. One icon set (lucide, ISC),
       one size; the .dbgov-whenOn / .dbgov-pwr / .dbgov-fam-btn flex does the centring. */
    #__dbgov-bar button svg { width: 16px; height: 16px; pointer-events: none; }
    #__dbgov-bar .dbgov-grip svg { width: 14px; height: 14px; display: block; }
    #__dbgov-list .dbgov-tag svg { width: 14px; height: 14px; vertical-align: -3px; }
    #__dbgov-bar button.dbgov-tool:hover, #__dbgov-bar button.dbgov-act:hover { background: #3a3a40; }
    #__dbgov-bar button.dbgov-tool.dbgov-armed,
    #__dbgov-bar button.dbgov-bctl.dbgov-armed { background: #58c4ff; color: #0d1b24; }
    /* an OPEN axis head is a drawer pulled out, not a value in force —
       a ring, not the armed fill, so the two states cannot be confused */
    #__dbgov-bar button.dbgov-bctl.dbgov-axis.dbgov-open { box-shadow: inset 0 0 0 2px #58c4ff; }
    /* a fixed member is information: always on, takes no click */
    #__dbgov-bar button.dbgov-bctl.dbgov-fixed { opacity: .55; cursor: default; }
    /* A tool in the run that feeds ⌕ carries a dot. Armed or not, it is still
       swept — the dot says "this contributes findings", the fill says "this
       is drawn". They are different questions and used to look the same. */
    #__dbgov-bar button.dbgov-tool.dbgov-checks { position: relative; }
    #__dbgov-bar button.dbgov-tool.dbgov-checks::after {
      content: ''; position: absolute; right: 2px; bottom: 2px;
      width: 4px; height: 4px; border-radius: 50%; background: #b5e853; }
    #__dbgov-bar button.dbgov-act.dbgov-armed { background: #b5e853; color: #1a1a1a; }

    #__dbgov-bar.dbgov-tucked { opacity: .4; }
    #__dbgov-bar.dbgov-tucked:hover { opacity: 1; }
  `;
