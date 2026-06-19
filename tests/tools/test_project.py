"""Tests for project system — store and tool."""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

from butler.data.project_store import Project, ProjectStore


def _run(coro):
    return asyncio.run(coro)


class TestProjectStore:
    def test_save_and_retrieve(self) -> None:
        kv = MagicMock()
        kv.get.return_value = (
            '{"name": "myapp", "path": "/home/user/myapp", '
            '"commands": ["poetry install"], "editor": "code .", '
            '"tags": ["python", "web"], "description": "A web app"}'
        )
        store = ProjectStore(kv)

        saved = store.save_project(Project(
            name="myapp",
            path="/home/user/myapp",
            commands=["poetry install"],
            editor="code .",
            tags=["python", "web"],
            description="A web app",
        ))
        assert saved is True

        project = store.get_project("myapp")
        assert project is not None
        assert project.name == "myapp"
        assert project.path == "/home/user/myapp"
        assert project.commands == ["poetry install"]
        assert project.editor == "code ."
        assert project.tags == ["python", "web"]
        assert project.description == "A web app"

    def test_list_returns_all(self) -> None:
        kv = MagicMock()
        kv.all.return_value = {
            "project_a": '{"name": "a", "path": "/a", "commands": [], "editor": "", "tags": [], "description": ""}',
            "project_b": '{"name": "b", "path": "/b", "commands": [], "editor": "", "tags": [], "description": ""}',
        }
        store = ProjectStore(kv)
        projects = store.list_projects()
        assert len(projects) == 2

    def test_delete(self) -> None:
        kv = MagicMock()
        kv.delete.return_value = True
        store = ProjectStore(kv)
        assert store.delete_project("test1") is True

    def test_get_nonexistent(self) -> None:
        kv = MagicMock()
        kv.get.return_value = None
        store = ProjectStore(kv)
        assert store.get_project("nonexistent") is None


class TestProjectTool:
    def test_open_nonexistent_path(self) -> None:
        """open_project with a project whose path does not exist returns an error."""
        from butler.tools.project import OpenProjectTool

        kv = MagicMock()
        kv.get.return_value = (
            '{"name": "ghost", "path": "/nonexistent/path/xyzzy", '
            '"commands": [], "editor": "", "tags": [], "description": ""}'
        )
        tool = OpenProjectTool()

        with patch("butler.tools.project._get_store", return_value=ProjectStore(kv)):
            with patch("pathlib.Path.exists", return_value=False):
                result = _run(tool.execute(name="ghost"))

        assert result.success is False
        assert "does not exist" in result.output or "not found" in result.error

    def test_list_projects_tool(self) -> None:
        """list_projects tool returns project listing."""
        from butler.tools.project import ListProjectsTool

        kv = MagicMock()
        kv.all.return_value = {
            "project_x": (
                '{"name": "x", "path": "/x", "commands": [], '
                '"editor": "", "tags": [], "description": ""}'
            ),
        }
        tool = ListProjectsTool()

        with patch("butler.tools.project._get_store", return_value=ProjectStore(kv)):
            result = _run(tool.execute())

        assert result.success is True
        assert "x" in result.output

    def test_add_project_tool(self) -> None:
        """add_project tool saves a project."""
        from butler.tools.project import AddProjectTool

        kv = MagicMock()
        kv.set.return_value = True
        tool = AddProjectTool()

        with patch("butler.tools.project._get_store", return_value=ProjectStore(kv)):
            result = _run(tool.execute(
                name="testproj",
                path="/tmp/testproj",
                commands=["make build"],
                editor="vim",
                description="A test project",
                tags=["test"],
            ))

        assert result.success is True
        assert "Saved" in result.output

    def test_remove_project_tool(self) -> None:
        """remove_project tool deletes a project."""
        from butler.tools.project import RemoveProjectTool

        kv = MagicMock()
        kv.get.return_value = (
            '{"name": "oldie", "path": "/tmp/oldie", '
            '"commands": [], "editor": "", "tags": [], "description": ""}'
        )
        kv.delete.return_value = True
        tool = RemoveProjectTool()

        with patch("butler.tools.project._get_store", return_value=ProjectStore(kv)):
            result = _run(tool.execute(name="oldie"))

        assert result.success is True
        assert "Removed" in result.output
