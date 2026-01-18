from fastapi import FastAPI, File, UploadFile, HTTPException

from lightweight_validation.foreground_check import check_foreground
from lightweight_validation.recapture_check_gemini import check_recapture

from analytics.raredex_backend.label_generation.api.routes import router
from analytics.raredex_backend.label_generation.core.config import get_settings

def create_app() -> FastAPI:
    app = FastAPI(title="ML services")

    settings = get_settings()
    # Attach settings to router (simple DI)
    router.settings = settings  # type: ignore[attr-defined]

    app.include_router(router)
    return app

app = create_app()

@app.get("/foreground-check/{image_id}")
async def foreground_check(file: UploadFile = File(...)):
  if file.content_type != "image/jpeg":
    raise HTTPException(status_code=400, detail="Only JPEG is supported")

  image_bytes = await file.read()
  if not image_bytes:
    raise HTTPException(status_code=400, detail="Empty file")

  try:
    result = check_foreground(image_bytes)
  except ValueError:
    raise HTTPException(status_code=400, detail="Invalid JPEG data")

  return result

@app.get("/recapture-check/{image_uuid}")
async def recapture_check(image_uuid: str):
  result = check_recapture(image_uuid)
  return result

if __name__ == "__main__":
  import uvicorn
  uvicorn.run(app, host="0.0.0.0", port=8000)
  # image_uuid = "02eb8eb3-b9cd-4aa9-a71d-8aa853a709fd"
  # print("Start query")
  # print(check_recapture(image_uuid))
