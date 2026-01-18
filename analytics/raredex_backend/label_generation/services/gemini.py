from __future__ import annotations

import json
import re
from typing import List

from google import genai
from google.genai import types

from raredex_backend.label_generation.core.config import Settings
from raredex_backend.label_generation.core.prompts import SPECIFICITY_PROMPT


class GeminiService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = genai.Client(api_key=settings.gemini_api_key)

    def propose_labels(self, image_bytes: bytes, mime_type: str = "image/jpeg") -> List[str]:
        contents = [
            SPECIFICITY_PROMPT,
            types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
        ]
        resp = self._client.models.generate_content(
            model=self._settings.gemini_vlm_model,
            contents=contents,
        )
        return _parse_labels(resp.text or "")

    def embed_text(self, text: str) -> list[float]:
        # Gemini embedding model is available via embed_content.
        # Model: gemini-embedding-001
        result = self._client.models.embed_content(
            model=self._settings.gemini_embedding_model,
            contents=text,
        )
        # SDK returns a list of embeddings; for single text, take first.
        # Result shape: result.embeddings[0].values
        emb0 = result.embeddings[0]
        return list(emb0.values)


def _parse_labels(text: str) -> List[str]:
    if not text:
        return []

    raw = text.strip()

    # 1) Remove outer code fences if the *entire* response is fenced
    raw = re.sub(r"^\s*```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```\s*$", "", raw)

    # 2) Try direct JSON parse
    try:
        obj = json.loads(raw)
        if isinstance(obj, list):
            return _clean_labels(obj)
    except json.JSONDecodeError:
        pass

    # 3) Bracket-aware extraction of first JSON array
    start = None
    for i, ch in enumerate(raw):
        if ch == "[":
            start = i
            break

    if start is not None:
        depth = 0
        in_string = False
        escape = False

        for j in range(start, len(raw)):
            c = raw[j]

            if in_string:
                if escape:
                    escape = False
                elif c == "\\":
                    escape = True
                elif c == '"':
                    in_string = False
                continue

            if c == '"':
                in_string = True
                continue

            if c == "[":
                depth += 1
            elif c == "]":
                depth -= 1
                if depth == 0:
                    candidate = raw[start:j + 1]
                    try:
                        obj = json.loads(candidate)
                        if isinstance(obj, list):
                            return _clean_labels(obj)
                    except json.JSONDecodeError:
                        break

    # 4) LAST resort fallback
    parts = [
        p.strip(" \t\r\n,")
        for p in re.split(r"[\n,]+", raw)
        if p.strip() and not p.strip().startswith("```")
    ]
    return _dedupe_preserve_order(parts)[:3]


def _clean_labels(obj) -> List[str]:
    labels = []
    for x in obj:
        s = str(x).strip()
        if s:
            labels.append(s)
    return _dedupe_preserve_order(labels)[:3]


def _dedupe_preserve_order(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for x in items:
        k = x.strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(x.strip())
    return out
