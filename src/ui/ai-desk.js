/* ============================================================
   THE AI DESK — CONTRACT (Wave 1 stub)
   ------------------------------------------------------------
   The Desk is the docked right-hand sidebar (a full-height sheet
   on phones) every AI pill opens. It is LAZY: src/ui/ai-pill.js
   reaches it with `import('./ai-desk.js')` at a click, so nothing
   here is in any page's first paint.

   This file is a STUB. The registry is real; openDesk() only logs.
   Wave 2 replaces the body with the full sidebar and MUST KEEP
   these exports and this contract.

   EXPORTS
     registerTask(task)       add or replace a task by id; returns task
     getTask(id)              the task, or null
     listTasks()              every registered task, in insertion order
     openDesk(taskId, ctx)    open the Desk on that task with that ctx
     closeDesk()              close it; the session (chat + versions)
                              stays in memory until reload

   TASK SHAPE
     {
       id:     string, unique
       label:  string, the name the Desk header and pill menu show
       kind:   'text' | 'list' | 'read'
       schema: the JSON schema the model answers against (the same
               object the existing ai.js function uses)
       input(ctx)            → the input the task will send, derived
                               from the ctx the pill was built with;
                               shown, editable, before the first send
       buildPrompt(input)    → { system, user } — what goes on the wire
       run(input, { onStatus, signal, refine })
                             → Promise of a kind-shaped result:
            'text' → { original: string, proposed: string, note?: string }
            'list' → { items: [{ id, text, detail? }] }
            'read' → { text: string }
          `refine` is undefined on the first send, and on a chat
          refinement is { previous, instructions: string[] } where
          `previous` is the current version's result and
          `instructions` the numbered chat messages so far. A refine
          re-sends the same system prompt against the SAME schema.
       apply(selected, ctx)  → performs the write through the owning
                               model (editor edit path, scenes.js,
                               blueprint-store writeFields). For 'text'
                               `selected` is the final merged string
                               (only the ticked hunks applied); for
                               'list' it is the array of chosen items;
                               'read' tasks may omit apply. May return
                               an undo function (or a Promise of one),
                               which the Desk offers as an actionable
                               Undo toast. One Accept is one write.
     }

   RULES
     - Chat and versions live in memory for this page only: no
       storage key, nothing written while idle, nothing in backups.
     - No key on this device → openDesk shows a single step linking
       to settings.html#ai. No key form exists in the Desk.
     - A locked plan never reaches openDesk: the pill stops it.
   ============================================================ */

const tasks = new Map();

export function registerTask(task) {
  if (!task || !task.id) throw new Error('[ai-desk] a task needs an id');
  tasks.set(task.id, task);
  return task;
}

export function getTask(id) {
  return tasks.get(id) || null;
}

export function listTasks() {
  return [...tasks.values()];
}

export function openDesk(taskId, ctx = {}) {
  console.info('[ai-desk] stub: openDesk', taskId, getTask(taskId) ? '' : '(unregistered)', ctx);
}

export function closeDesk() { /* stub */ }

export default { registerTask, getTask, listTasks, openDesk, closeDesk };
