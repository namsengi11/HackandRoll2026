from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, UploadFile

from analytics.raredex_backend.label_generation.api.schemas import LabelsResponse
from analytics.raredex_backend.label_generation.core.config import Settings
from analytics.raredex_backend.label_generation.pipelines.label_proposal import LabelProposalPipeline
from analytics.raredex_backend.label_generation.repos.labels import LabelsRepository
from analytics.raredex_backend.label_generation.services.gemini import GeminiService
from analytics.raredex_backend.label_generation.services.supabase import SupabaseService

router = APIRouter()


def _build_pipeline(settings: Settings) -> LabelProposalPipeline:
    supabase = SupabaseService(settings)
    gemini = GeminiService(settings)
    labels_repo = LabelsRepository(settings, supabase)
    return LabelProposalPipeline(settings, gemini, labels_repo)


@router.post("/labels/from-file", response_model=LabelsResponse)
async def labels_from_file(
    file: UploadFile = File(...),
):
    if file.content_type not in {"image/jpeg", "image/jpg"}:
        raise HTTPException(status_code=400, detail="Only JPEG is supported")

    image_bytes = await file.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty file")

    pipeline = _build_pipeline(router.settings)
    labels = pipeline.propose(image_bytes=image_bytes, mime_type="image/jpeg")
    return LabelsResponse(labels=labels)


@router.get("/labels/{image_uuid}", response_model=LabelsResponse)
def labels_from_uuid(image_uuid: str):
    pipeline = _build_pipeline(router.settings)
    supabase = SupabaseService(router.settings)
    image_bytes = supabase.download_submission_image(image_uuid)
    labels = pipeline.propose(image_bytes=image_bytes, mime_type="image/jpeg")
    return LabelsResponse(labels=labels)
