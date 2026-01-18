from fastapi import FastAPI, File, UploadFile, HTTPException

from foreground_check import check_foreground
from recapture_check_gemini import check_recapture

app = FastAPI()

@app.get("/foreground-check/{image_uuid}")
async def foreground_check(image_uuid: str):
  result = check_foreground(image_uuid)
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
