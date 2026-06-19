"""
Bantz LLM router — returns the active provider based on BUTLER_LLM_PROVIDER.

Provider       Config key              Required env var
─────────────────────────────────────────────────────
ollama         BUTLER_LLM_PROVIDER=ollama   BUTLER_OLLAMA_BASE_URL (default localhost)
claude         BUTLER_LLM_PROVIDER=claude   BUTLER_ANTHROPIC_API_KEY
openai         BUTLER_LLM_PROVIDER=openai   BUTLER_OPENAI_API_KEY
gemini         BUTLER_LLM_PROVIDER=gemini   BUTLER_GEMINI_API_KEY

Backward compat: if BUTLER_LLM_PROVIDER=ollama but BUTLER_GEMINI_ENABLED=true
and a key is set, Gemini is used (preserves pre-router behaviour).
"""
from __future__ import annotations

import logging

from butler.config import config

log = logging.getLogger("butler.llm.router")


def get_provider():
    """Return the active LLM client for conversation.

    All providers expose the same interface:
        await provider.chat(messages) -> str
        provider.chat_stream(messages) -> AsyncIterator[str]
        await provider.is_available() -> bool
    """
    provider = (config.llm_provider or "ollama").lower().strip()

    if provider == "claude":
        from butler.llm.anthropic_client import claude
        if not claude.is_enabled():
            raise RuntimeError(
                "BUTLER_LLM_PROVIDER=claude but BUTLER_ANTHROPIC_API_KEY is not set. "
                "Add it to your .env file."
            )
        return claude

    if provider == "openai":
        from butler.llm.openai_client import openai_client
        if not openai_client.is_enabled():
            raise RuntimeError(
                "BUTLER_LLM_PROVIDER=openai but BUTLER_OPENAI_API_KEY is not set. "
                "Add it to your .env file."
            )
        return openai_client

    if provider == "gemini":
        from butler.llm.gemini import gemini
        if not gemini.is_enabled():
            raise RuntimeError(
                "BUTLER_LLM_PROVIDER=gemini but BUTLER_GEMINI_API_KEY is not set "
                "or BUTLER_GEMINI_ENABLED=false. Add a key to your .env file."
            )
        return gemini

    # ollama (default) — backward compat: prefer Gemini if explicitly enabled
    if config.gemini_enabled and config.gemini_api_key:
        from butler.llm.gemini import gemini
        log.debug("router: using Gemini (backward compat, BUTLER_GEMINI_ENABLED=true)")
        return gemini

    from butler.llm.ollama import ollama
    return ollama


# Alias used by finalizer and other call-sites
get_llm = get_provider
