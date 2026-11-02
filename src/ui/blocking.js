/* ============================================================
   BLOCKING — the entry (src/ui/blocking.js)
   ------------------------------------------------------------
   Two sections for visualize.html, both reading the shot model
   (src/lib/shots.js) and writing only through it:

     #blocking     the blocking studio: a top-down floor plan per setup —
                   set pieces, actors and their walks beat by beat,
                   cameras with their field of view, lights, dolly
                   tracks and the 180-degree line. src/ui/blocking/
                   editor.js, with draw.js (the one drawing), tools.js
                   (palette, toolbar, inspector), history.js (undo, in
                   memory), export.js (PNG, PDF) and templates.js.
     #scene-board  one scene on one surface, read-only: board.js.

   This file stays the import path visualize.js has always used.
   ============================================================ */
export { renderBlocking, highlightCamera, showShotBlocking, drawReadOnly as drawBlock } from './blocking/editor.js';
export { renderSceneBoard } from './blocking/board.js';
