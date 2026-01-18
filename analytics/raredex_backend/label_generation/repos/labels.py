# label_generation/repos/labels.py
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from analytics.raredex_backend.label_generation.core.config import Settings
from analytics.raredex_backend.label_generation.services.supabase import SupabaseService


@dataclass
class LabelMatch:
    label_id: int
    label_name: str
    similarity: float


class LabelsRepository:
    """
    Works with your schema:
      - labels(id int8, name text, parent_id int8 nullable)
      - label_embeddings(label_id int8, embedding vector(...))

    Vector search is done via an RPC (pgvector) returning nearest label_id + name + similarity.
    """

    def __init__(self, settings: Settings, supabase: SupabaseService):
        self._settings = settings
        self._sb = supabase.client

    def find_nearest_label(self, query_embedding: list[float]) -> Optional[LabelMatch]:
        if not self._settings.enable_label_snap:
            return None

        res = self._sb.rpc(
            self._settings.match_rpc_name,
            {
                "query_embedding": query_embedding,
                "match_count": self._settings.match_count,
                "coarse_only": self._settings.snap_coarse_only,
            },
        ).execute()

        rows = res.data or []
        if not rows:
            return None

        row0 = rows[0]
        label_id = row0.get("label_id")
        label_name = str(row0.get("label_name", "")).strip()
        sim = float(row0.get("similarity", 0.0))

        if label_id is None or not label_name:
            return None
        return LabelMatch(label_id=int(label_id), label_name=label_name, similarity=sim)

