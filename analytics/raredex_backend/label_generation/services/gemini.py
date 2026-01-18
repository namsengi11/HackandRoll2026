from __future__ import annotations

import json
import re
from typing import List

from google import genai
from google.genai import types

from analytics.raredex_backend.label_generation.core.config import Settings
from analytics.raredex_backend.label_generation.core.prompts import SPECIFICITY_PROMPT


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
    """
    Robustly parse Gemini output into a list of up to 3 label strings.
    Handles:
      - JSON arrays
      - Markdown ```json code fences
      - Extra prose around the JSON
    """
    if not text:
        return []

    raw = text.strip()

    # 1) Remove markdown code fences if the whole response is fenced
    # e.g. ```json\n[...]\n```
    raw = re.sub(r"^\s*```(?:json)?\s*", "", raw, flags=re.IGNORECASE)
    raw = re.sub(r"\s*```\s*$", "", raw)

    # 2) Try direct JSON parse first
    try:
        obj = json.loads(raw)
        if isinstance(obj, list):
            return _clean_labels(obj)
    except json.JSONDecodeError:
        pass

    # 3) Extract first JSON array substring [...] from the response and parse it
    m = re.search(r"\[[\s\S]*?\]", raw)  # non-greedy match for first [...]
    if m:
        candidate = m.group(0)
        try:
            obj = json.loads(candidate)
            if isinstance(obj, list):
                return _clean_labels(obj)
        except json.JSONDecodeError:
            pass

    # 4) Final fallback: split by newlines/commas (best-effort)
    parts = [p.strip(" \t\r\n,") for p in re.split(r"[\n,]+", raw)]
    parts = [p for p in parts if p and not p.lower().startswith("```")]
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
