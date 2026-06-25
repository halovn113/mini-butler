"""Macro Tool — record, list, run, create, and delete automation macros.

Tools registered:
  list_macros   — list saved macros
  run_macro     — execute a macro by name
  create_macro  — create/edit a macro
  delete_macro  — remove a macro
  record_macro  — interactively record keystrokes/clicks
"""
from __future__ import annotations

import logging
import time
from typing import Any

from butler.data.macro_store import Macro, MacroStep, MacroStore
from butler.tools import BaseTool, ToolResult, registry

log = logging.getLogger("butler.tool.macro")


def _get_store() -> MacroStore | None:
    """Get the macro store from the data layer."""
    try:
        from butler.data.layer import data_layer
        return MacroStore(data_layer.kv)
    except Exception as exc:
        log.debug("macro store unavailable: %s", exc)
        return None


class ListMacrosTool(BaseTool):
    name = "list_macros"
    description = "List all saved automation macros."

    async def execute(self, **_kwargs) -> ToolResult:
        store = _get_store()
        if store is None:
            return ToolResult(success=False, output="Data layer not available")
        macros = store.list_macros()
        if not macros:
            return ToolResult(success=True, output="No macros saved.")
        lines = [f"  {m.name}: {m.description or '(no description)'} ({len(m.steps)} steps)" for m in macros]
        return ToolResult(success=True, output="Saved macros:\n" + "\n".join(lines))


class RunMacroTool(BaseTool):
    name = "run_macro"
    description = "Execute a saved macro by name. Params: name (str)."

    async def execute(self, name: str = "", **_kwargs) -> ToolResult:
        if not name:
            return ToolResult(success=False, output="Macro name required.")
        store = _get_store()
        if store is None:
            return ToolResult(success=False, output="Data layer not available")
        macro = store.get_macro(name)
        if macro is None:
            return ToolResult(success=False, output=f"Macro '{name}' not found.")
        return await _execute_macro(macro)


class CreateMacroTool(BaseTool):
    name = "create_macro"
    description = "Create or update a macro with a sequence of steps. Params: name (str), description (str, optional), steps (list of dicts), tags (list of str, optional). Each step: {action: 'key'|'type'|'click'|'scroll'|'wait'|'shell', params: {}}."

    async def execute(self, name: str = "", description: str = "",
                      steps: list[dict] | None = None,
                      tags: list[str] | None = None, **_kwargs) -> ToolResult:
        if not name:
            return ToolResult(success=False, output="Macro name required.")
        if not steps:
            return ToolResult(success=False, output="At least one step required.")
        store = _get_store()
        if store is None:
            return ToolResult(success=False, output="Data layer not available")
        macro = Macro(
            name=name,
            description=description,
            steps=[MacroStep(**s) for s in steps],
            tags=tags or [],
        )
        ok = store.save_macro(macro)
        if ok:
            return ToolResult(success=True, output=f"Macro '{name}' saved ({len(steps)} steps).")
        return ToolResult(success=False, output=f"Failed to save macro '{name}'.")


class DeleteMacroTool(BaseTool):
    name = "delete_macro"
    description = "Delete a saved macro by name. Params: name (str)."

    async def execute(self, name: str = "", **_kwargs) -> ToolResult:
        if not name:
            return ToolResult(success=False, output="Macro name required.")
        store = _get_store()
        if store is None:
            return ToolResult(success=False, output="Data layer not available")
        ok = store.delete_macro(name)
        if ok:
            return ToolResult(success=True, output=f"Macro '{name}' deleted.")
        return ToolResult(success=False, output=f"Macro '{name}' not found.")


class RecordMacroTool(BaseTool):
    name = "record_macro"
    description = "Interactively record a new macro. Params: name (str). Records keystrokes until Ctrl+C or Ctrl+D."

    async def execute(self, name: str = "", **_kwargs) -> ToolResult:
        if not name:
            return ToolResult(success=False, output="Macro name required.")
        store = _get_store()
        if store is None:
            return ToolResult(success=False, output="Data layer not available")
        try:
            steps = _record_steps()
            if not steps:
                return ToolResult(success=False, output="No steps recorded.")
            macro = Macro(name=name, description="Recorded macro", steps=steps)
            store.save_macro(macro)
            return ToolResult(success=True, output=f"Macro '{name}' recorded ({len(steps)} steps).")
        except Exception as exc:
            return ToolResult(success=False, output=f"Recording failed: {exc}")

def _record_steps() -> list[MacroStep]:
    """Record macro steps via pynput event capture.

    Listens for keyboard and mouse events until F12 is pressed.
    """
    try:
        from pynput import keyboard, mouse
    except ImportError:
        return _record_steps_stdin()

    import threading
    import queue

    steps: list[MacroStep] = []
    stop_flag = threading.Event()
    ev_queue: queue.Queue = queue.Queue()

    print("🎙 Recording macro. F12 to stop.")
    print("  (keystrokes, mouse clicks, scrolls are captured)")

    def on_press(key):
        try:
            if hasattr(keyboard, "Key"):
                if key == keyboard.Key.f12:
                    stop_flag.set()
                    return False
                try:
                    ev_queue.put(MacroStep(
                        action="key",
                        params={"key": key.char if hasattr(key, "char") else str(key)},
                    ))
                except AttributeError:
                    ev_queue.put(MacroStep(action="key", params={"key": str(key)}))
        except Exception:
            pass

    def on_click(x, y, button, pressed):
        if pressed:
            ev_queue.put(MacroStep(
                action="click",
                params={"button": str(button), "x": x, "y": y},
            ))

    def on_scroll(x, y, dx, dy):
        ev_queue.put(MacroStep(action="scroll", params={"dx": dx, "dy": dy}))

    listener_kbd = keyboard.Listener(on_press=on_press)
    listener_mouse = mouse.Listener(on_click=on_click, on_scroll=on_scroll)
    listener_kbd.start()
    listener_mouse.start()

    stop_flag.wait()
    listener_kbd.stop()
    listener_mouse.stop()

    # Drain queue
    while not ev_queue.empty():
        try:
            steps.append(ev_queue.get_nowait())
        except queue.Empty:
            break

    return steps


def _record_steps_stdin() -> list[MacroStep]:
    """Fallback: read macro steps as text from stdin."""
    import sys
    steps: list[MacroStep] = []
    print("Recording macro. Enter one action per line:")
    print("  key:<key_name>    type:<text>    click    scroll:<dx>,<dy>")
    print("  wait:<seconds>    shell:<cmd>")
    print("  (empty line to stop)")
    for line in sys.stdin:
        line = line.strip()
        if not line:
            break
        if ":" in line:
            action, _, param = line.partition(":")
            if action == "key":
                steps.append(MacroStep(action="key", params={"key": param.strip()}))
            elif action == "type":
                steps.append(MacroStep(action="type", params={"text": param.strip()}))
            elif action == "scroll":
                parts = param.split(",")
                dx = int(parts[0].strip()) if parts else 0
                dy = int(parts[1].strip()) if len(parts) > 1 else 0
                steps.append(MacroStep(action="scroll", params={"dx": dx, "dy": dy}))
            elif action == "wait":
                steps.append(MacroStep(action="wait", params={"seconds": float(param.strip())}))
            elif action == "shell":
                steps.append(MacroStep(action="shell", params={"cmd": param.strip()}))
        elif line == "click":
            steps.append(MacroStep(action="click", params={}))
    return steps


async def _execute_macro(macro: Macro) -> ToolResult:
    """Execute the steps of a macro sequentially."""
    results: list[str] = []
    for i, step in enumerate(macro.steps):
        try:
            await _execute_step(step)
            results.append(f"  Step {i+1}: {step.action} OK")
        except Exception as exc:
            results.append(f"  Step {i+1}: {step.action} FAILED — {exc}")
            return ToolResult(
                success=False,
                output=f"Macro '{macro.name}' failed at step {i+1}:\n" + "\n".join(results),
            )
    return ToolResult(
        success=True,
        output=f"Macro '{macro.name}' completed ({len(macro.steps)} steps):\n" + "\n".join(results),
    )


async def _execute_step(step: MacroStep) -> None:
    """Execute a single macro step."""
    action = step.action
    params = step.params

    if action == "key":
        from butler.tools.gui_action import exec_key
        await exec_key(key=params.get("key", ""), modifiers=params.get("modifiers"))
    elif action == "type":
        from butler.tools.input_control import exec_type
        from butler.tools.gui_action import exec_type as gui_type
        try:
            await gui_type(text=params.get("text", ""))
        except Exception:
            await exec_type(text=params.get("text", ""))
    elif action == "click":
        from butler.tools.gui_action import exec_click
        await exec_click(
            button=params.get("button", "left"),
            x=params.get("x"), y=params.get("y"),
        )
    elif action == "scroll":
        from butler.tools.gui_action import exec_scroll
        await exec_scroll(dx=params.get("dx", 0), dy=params.get("dy", 0))
    elif action == "wait":
        await _async_sleep(params.get("seconds", 1.0))
    elif action == "shell":
        from butler.tools.system_tool import system_tool
        result = system_tool.run(params.get("cmd", ""), safe_mode=True)
        if not result.success:
            raise RuntimeError(result.stderr or result.stdout)


async def _async_sleep(seconds: float) -> None:
    """Async sleep."""
    import asyncio
    await asyncio.sleep(seconds)


registry.register(ListMacrosTool())
registry.register(RunMacroTool())
registry.register(CreateMacroTool())
registry.register(DeleteMacroTool())
registry.register(RecordMacroTool())
