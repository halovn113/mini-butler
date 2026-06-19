"""
Butler — Anthropic Claude client
Raw httpx implementation — no SDK dependency.
Supports claude-opus-4-8, claude-sonnet-4-6, claude-haiku-4-5-20251001.
"""
from __future__ import annotations

import json
import httpx
from typing import AsyncIterator

from butler.config import config


class AnthropicClient:
    API_URL     = "https://api.anthropic.com/v1/messages"
    API_VERSION = "2023-06-01"

    def __init__(self) -> None:
        self._client: httpx.AsyncClient | None = None

    # Read config live so the UI's set_config (which updates the config
    # singleton + .env at runtime) takes effect without restarting the daemon.
    @property
    def _api_key(self) -> str:
        return config.anthropic_api_key

    @property
    def _model(self) -> str:
        return config.anthropic_model

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient()
        return self._client

    def is_enabled(self) -> bool:
        return bool(config.anthropic_api_key)

    def _headers(self) -> dict:
        return {
            "x-api-key":         self._api_key,
            "anthropic-version": self.API_VERSION,
            "content-type":      "application/json",
        }

    def _convert(self, messages: list[dict]) -> tuple[str, list[dict]]:
        """Split OpenAI-style messages into (system_prompt, user/assistant turns).

        Vision passthrough: Ollama-style base64 PNGs in a user message's
        ``images`` list become Anthropic image content blocks.
        """
        system = ""
        turns: list[dict] = []
        for m in messages:
            role, content = m["role"], m["content"]
            if role == "system":
                system += content + "\n"
            elif role in ("user", "assistant"):
                images = m.get("images") or []
                if role == "user" and images:
                    blocks: list[dict] = [
                        {
                            "type": "image",
                            "source": {
                                "type": "base64",
                                "media_type": "image/png",
                                "data": img_b64,
                            },
                        }
                        for img_b64 in images
                    ]
                    blocks.append({"type": "text", "text": content})
                    turns.append({"role": role, "content": blocks})
                else:
                    turns.append({"role": role, "content": content})
        return system.strip(), turns

    async def chat(self, messages: list[dict], temperature: float = 0.7) -> str:
        system, turns = self._convert(messages)
        payload: dict = {
            "model":      self._model,
            "max_tokens": 1024,
            "messages":   turns,
        }
        if system:
            payload["system"] = system

        resp = await self.client.post(
            self.API_URL,
            headers=self._headers(),
            json=payload,
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json()["content"][0]["text"]

    async def chat_stream(self, messages: list[dict], temperature: float = 0.7) -> AsyncIterator[str]:
        system, turns = self._convert(messages)
        payload: dict = {
            "model":      self._model,
            "max_tokens": 1024,
            "messages":   turns,
            "stream":     True,
        }
        if system:
            payload["system"] = system

        async with self.client.stream(
            "POST", self.API_URL,
            headers=self._headers(),
            json=payload,
            timeout=120.0,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                line = line.strip()
                if not line or not line.startswith("data: "):
                    continue
                json_str = line[6:]
                if json_str == "[DONE]":
                    return
                try:
                    data = json.loads(json_str)
                    if data.get("type") == "content_block_delta":
                        delta = data.get("delta", {})
                        if delta.get("type") == "text_delta":
                            text = delta.get("text", "")
                            if text:
                                yield text
                except (json.JSONDecodeError, KeyError):
                    continue

    async def is_available(self) -> bool:
        if not self._enabled:
            return False
        try:
            resp = await self.client.get(
                "https://api.anthropic.com/v1/models",
                headers=self._headers(),
                timeout=5.0,
            )
            return resp.status_code == 200
        except Exception:
            return False


claude = AnthropicClient()
