from __future__ import annotations

from supabase import create_client

from analytics.raredex_backend.label_generation.core.config import Settings


class SupabaseService:
    def __init__(self, settings: Settings):
        self._settings = settings
        self._client = create_client(settings.supabase_url, settings.supabase_key)

    @property
    def client(self):
        return self._client

    def download_submission_image(self, image_uuid: str) -> bytes:
        record = (
            self._client.table(self._settings.supabase_submissions_table)
            .select("image_path")
            .eq("id", image_uuid)
            .single()
            .execute()
        )
        data = record.data or {}
        image_path = data.get("image_path")
        if not image_path:
            raise ValueError(f"No image_path found for {image_uuid}.")
        storage = self._client.storage.from_(self._settings.supabase_storage_bucket)
        return storage.download(image_path)
