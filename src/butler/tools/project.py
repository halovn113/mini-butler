"""Project Tool — list, open, add, and remove workspace projects."""
from __future__ import annotations

import logging
import subprocess
from pathlib import Path
from typing import Any

from butler.data.project_store import Project, ProjectStore
from butler.tools import BaseTool, ToolResult, registry

log = logging.getLogger("butler.tool.project")


def _get_store() -> ProjectStore | None:
    """Get the project store from the data layer."""
    try:
        from butler.data.layer import data_layer
        return ProjectStore(data_layer.kv)
    except Exception as exc:
        log.debug("project store unavailable: %s", exc)
        return None


@registry.register
class ListProjectsTool(BaseTool):
    name = "list_projects"
    description = "List all saved workspace projects."
    risk_level = "safe"

    async def execute(self, **kwargs: Any) -> ToolResult:
        store = _get_store()
        if store is None:
            return ToolResult(success=False, output="Data layer not available")
        projects = store.list_projects()
        if not projects:
            return ToolResult(success=True, output="No projects saved.")
        lines = [
            f"  {p.name}: {p.path}"
            + (f" — {p.description}" if p.description else "")
            + (f" [{', '.join(p.tags)}]" if p.tags else "")
            for p in projects
        ]
        return ToolResult(success=True, output="Projects:\n" + "\n".join(lines))


@registry.register
class OpenProjectTool(BaseTool):
    name = "open_project"
    description = "Open a project: cd to its path, run setup commands, and launch the configured editor."
    risk_level = "moderate"

    async def execute(self, name: str = "", **kwargs: Any) -> ToolResult:
        if not name:
            return ToolResult(success=False, output="", error="Project name is required.")
        store = _get_store()
        if store is None:
            return ToolResult(success=False, output="Data layer not available")
        project = store.get_project(name)
        if project is None:
            return ToolResult(success=False, output=f"Project '{name}' not found.")

        path = Path(project.path)
        if not path.exists():
            return ToolResult(
                success=False,
                output=f"Project path does not exist: {project.path}",
                error=f"Path not found: {project.path}",
            )

        # Run each setup command in the project directory
        for cmd in project.commands:
            try:
                subprocess.Popen(
                    cmd,
                    shell=True,
                    cwd=str(path),
                )
            except Exception as exc:
                log.warning("failed to run command '%s' for project '%s': %s", cmd, name, exc)

        # Open editor if configured
        if project.editor:
            try:
                subprocess.Popen(
                    project.editor,
                    shell=True,
                    cwd=str(path),
                )
            except Exception as exc:
                log.warning("failed to open editor for project '%s': %s", name, exc)

        return ToolResult(
            success=True,
            output=f"Opened project '{name}' at {project.path}.",
            data={"name": name, "path": project.path},
        )


@registry.register
class AddProjectTool(BaseTool):
    name = "add_project"
    description = "Add or update a workspace project."
    risk_level = "moderate"

    async def execute(
        self,
        name: str = "",
        path: str = "",
        commands: list[str] | None = None,
        editor: str = "",
        description: str = "",
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> ToolResult:
        if not name or not path:
            return ToolResult(success=False, output="", error="Project name and path are required.")
        store = _get_store()
        if store is None:
            return ToolResult(success=False, output="Data layer not available")
        project = Project(
            name=name,
            path=path,
            commands=commands or [],
            editor=editor,
            tags=tags or [],
            description=description,
        )
        ok = store.save_project(project)
        if ok:
            return ToolResult(success=True, output=f"Saved project '{name}'.")
        return ToolResult(success=False, output=f"Failed to save project '{name}'.")


@registry.register
class RemoveProjectTool(BaseTool):
    name = "remove_project"
    description = "Remove a saved project."
    risk_level = "destructive"

    async def execute(self, name: str = "", **kwargs: Any) -> ToolResult:
        if not name:
            return ToolResult(success=False, output="", error="Project name is required.")
        store = _get_store()
        if store is None:
            return ToolResult(success=False, output="Data layer not available")
        project = store.get_project(name)
        if project is None:
            return ToolResult(success=False, output=f"Project '{name}' not found.")
        ok = store.delete_project(name)
        if ok:
            return ToolResult(success=True, output=f"Removed project '{name}'.")
        return ToolResult(success=False, output=f"Failed to remove project '{name}'.")
