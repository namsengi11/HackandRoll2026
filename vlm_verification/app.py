from __future__ import annotations

import os
import logging
from dataclasses import dataclass
from io import BytesIO

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from dotenv import load_dotenv
from PIL import Image, UnidentifiedImageError
from supabase import create_client

from verification.entrypoint import verify_submission

app = FastAPI()

logger = logging.getLogger(__name__)


load_dotenv()


def _validate_image_bytes(image_bytes: bytes, *, source: str, require_jpeg: bool = True) -> None:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image")

    try:
        with Image.open(BytesIO(image_bytes)) as img:
            img.verify()
            if require_jpeg and (img.format or "").upper() != "JPEG":
                raise HTTPException(
                    status_code=400,
                    detail=f"{source}: expected JPEG, got {img.format}",
                )
    except HTTPException:
        raise
    except UnidentifiedImageError:
        raise HTTPException(status_code=400, detail=f"{source}: bytes are not a valid image")
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"{source}: invalid image ({e.__class__.__name__}: {e})",
        )


@dataclass(frozen=True)
class SupabaseSettings:
    supabase_url: str
    supabase_key: str
    supabase_storage_bucket: str = "submissions"
    supabase_submissions_table: str = "submissions"


def get_supabase_settings() -> SupabaseSettings:
    supabase_url = os.getenv("SUPABASE_URL", os.getenv("supabase_api", "")).strip()
    supabase_key = os.getenv("SUPABASE_SERVICE_KEY", os.getenv("supabase_key", "")).strip()
    if not supabase_url or not supabase_key:
        raise RuntimeError(
            "SUPABASE_URL/SUPABASE_SERVICE_KEY (or supabase_api/supabase_key) is not set."
        )
    return SupabaseSettings(
        supabase_url=supabase_url,
        supabase_key=supabase_key,
        supabase_storage_bucket=os.getenv("SUPABASE_STORAGE_BUCKET", "submissions").strip() or "submissions",
        supabase_submissions_table=os.getenv("SUPABASE_SUBMISSIONS_TABLE", "submissions").strip() or "submissions",
    )


class SupabaseService:
    def __init__(self, settings: SupabaseSettings):
        self._settings = settings
        self._client = create_client(settings.supabase_url, settings.supabase_key)

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

@app.post("/verify-submission")
async def verify_submission_route(
    file: UploadFile = File(...),
    proposed_label: str = Form(...),
):
    if file.content_type != "image/jpeg":
        raise HTTPException(status_code=400, detail="Only JPEG is supported")

    proposed_label = (proposed_label or "").strip()
    if not proposed_label:
        raise HTTPException(status_code=400, detail="proposed_label is required")
    if len(proposed_label) > 200:
        raise HTTPException(status_code=400, detail="proposed_label is too long")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    _validate_image_bytes(image_bytes, source="upload", require_jpeg=True)
    
    try:
        result = verify_submission(
            image_bytes=image_bytes,
            proposed_label=proposed_label,
            is_controversial=True,  
            options={"use_web": False, "n_web": 10, "top_k": 2, "include_debug": False},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        # e.g. GEMINI_API_KEY env var not set.
        logger.exception("verify_submission failed")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("verify_submission failed")
        raise HTTPException(
            status_code=500,
            detail=f"Internal verification error ({e.__class__.__name__}: {e})",
        )

    return result


@app.post("/vlm-verification/{image_uuid}")
async def verify_submission_uuid_route(
    image_uuid: str,
    proposed_label: str = Form(...),
):
    proposed_label = (proposed_label or "").strip()
    if not proposed_label:
        raise HTTPException(status_code=400, detail="proposed_label is required")
    if len(proposed_label) > 200:
        raise HTTPException(status_code=400, detail="proposed_label is too long")

    try:
        settings = get_supabase_settings()
        supabase = SupabaseService(settings)
        image_bytes = supabase.download_submission_image(image_uuid)
    except ValueError as e:
        # e.g. no image_path found
        raise HTTPException(status_code=404, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("Supabase download failed for image_uuid=%s", image_uuid)
        raise HTTPException(
            status_code=500,
            detail=f"Failed to download image ({e.__class__.__name__}: {e})",
        )

    if not image_bytes:
        raise HTTPException(status_code=404, detail="Empty image")

    # If Supabase returns HTML/JSON/error payload instead of the file, fail fast with a clear message.
    _validate_image_bytes(image_bytes, source="supabase download", require_jpeg=True)

    try:
        result = verify_submission(
            image_bytes=image_bytes,
            proposed_label=proposed_label,
            is_controversial=True,
            options={"use_web": False, "n_web": 10, "top_k": 2, "include_debug": False},
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        logger.exception("verify_submission failed")
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        logger.exception("verify_submission failed")
        raise HTTPException(
            status_code=500,
            detail=f"Internal verification error ({e.__class__.__name__}: {e})",
        )

    return result