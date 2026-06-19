"""Project store — persistent storage for workspace projects.

Each project is a named workspace with a path, commands, editor, tags, and description.
Stored in SQLite via the existing KV store using a 'project_' key prefix.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from typing import Optional

log = logging.getLogger("butler.data.project_store")

PROJECT_KV_PREFIX = "project_"


@dataclass
class Project:
    """A named workspace project."""
    name: str
    path: str
    commands: list[str] = field(default_factory=list)
    editor: str = ""
    tags: list[str] = field(default_factory=list)
    description: str = ""


class ProjectStore:
    """Persistent project storage via SQLite KV store."""

    def __init__(self, kv) -> None:
        self._kv = kv

    def list_projects(self) -> list[Project]:
        """Return all stored projects."""
        projects: list[Project] = []
        if self._kv is None:
            return projects
        try:
            all_items = self._kv.all()
            for key, raw in all_items.items():
                if key.startswith(PROJECT_KV_PREFIX):
                    raw_str = raw
                    if raw_str:
                        projects.append(_deserialize(raw_str, key))
        except Exception as exc:
            log.debug("project list failed: %s", exc)
        return projects

    def get_project(self, name: str) -> Optional[Project]:
        """Get a project by name."""
        if self._kv is None:
            return None
        try:
            raw = self._kv.get(PROJECT_KV_PREFIX + name)
            if raw:
                return _deserialize(raw, PROJECT_KV_PREFIX + name)
        except Exception as exc:
            log.debug("project get failed: %s", exc)
        return None

    def save_project(self, project: Project) -> bool:
        """Save or overwrite a project."""
        if self._kv is None:
            return False
        try:
            data = {
                "name": project.name,
                "path": project.path,
                "commands": project.commands,
                "editor": project.editor,
                "tags": project.tags,
                "description": project.description,
            }
            self._kv.set(PROJECT_KV_PREFIX + project.name, json.dumps(data))
            return True
        except Exception as exc:
            log.error("project save failed: %s", exc)
            return False

    def delete_project(self, name: str) -> bool:
        """Delete a project by name."""
        if self._kv is None:
            return False
        try:
            self._kv.delete(PROJECT_KV_PREFIX + name)
            return True
        except Exception as exc:
            log.debug("project delete failed: %s", exc)
            return False


def _deserialize(raw: str, key: str) -> Project:
    """Deserialize stored JSON into a Project."""
    try:
        data = json.loads(raw)
        return Project(
            name=data.get("name", key.replace(PROJECT_KV_PREFIX, "")),
            path=data.get("path", ""),
            commands=data.get("commands", []),
            editor=data.get("editor", ""),
            tags=data.get("tags", []),
            description=data.get("description", ""),
        )
    except (json.JSONDecodeError, KeyError) as exc:
        log.debug("failed to deserialize project %s: %s", key, exc)
        return Project(name=key.replace(PROJECT_KV_PREFIX, ""), path="")
