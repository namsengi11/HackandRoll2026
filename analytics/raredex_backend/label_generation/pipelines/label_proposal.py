from __future__ import annotations

from typing import List

from analytics.raredex_backend.label_generation.core.config import Settings
from analytics.raredex_backend.label_generation.repos.labels import LabelsRepository
from analytics.raredex_backend.label_generation.services.gemini import GeminiService


def dedupe_preserve_order(items: List[str]) -> List[str]:
    seen = set()
    out: List[str] = []
    for x in items:
        k = x.strip().lower()
        if k and k not in seen:
            seen.add(k)
            out.append(x.strip())
    return out


class LabelProposalPipeline:
    def __init__(
        self,
        settings: Settings,
        gemini: GeminiService,
        labels_repo: LabelsRepository,
    ):
        self._settings = settings
        self._gemini = gemini
        self._labels_repo = labels_repo

    def propose(self, image_bytes: bytes, mime_type: str = "image/jpeg") -> List[str]:
        candidates = self._gemini.propose_labels(image_bytes=image_bytes, mime_type=mime_type)
        candidates = dedupe_preserve_order(candidates)

        # Always guarantee 3 outputs
        candidates = (candidates + ["unknown item", "unknown object", "unknown collectible"])[:3]

        if not self._settings.enable_label_snap:
            return candidates

        snapped: List[str] = []
        for lbl in candidates:
            snapped.append(self._snap_or_keep(lbl))

        snapped = dedupe_preserve_order(snapped)
        # Ensure exactly 3 (fill from original candidates if snapping collapsed items)
        snapped = (snapped + candidates)[:3]
        return snapped

    def _snap_or_keep(self, candidate: str) -> str:
        if not self._settings.enable_label_snap:
            return candidate

        emb = self._gemini.embed_text(candidate)
        match = self._labels_repo.find_nearest_label(emb)
        if match and match.similarity >= self._settings.similarity_threshold:
            return match.label_name

        return candidate
