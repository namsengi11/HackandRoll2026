import os

from pathlib import Path
from google import genai
from supabase import create_client
from google.genai import types

try:
  from dotenv import load_dotenv
  load_dotenv()
except Exception:
  pass

_model = None
_supabase = None

MODEL_NAME = "gemini-2.5-flash"
PROMPT = "Is the image a photo of an object inside a monitor/tv screen? Answer only yes or no."


def _load_env_key() -> str:
  env_path = Path(__file__).resolve().parent / ".env"
  if not env_path.exists():
    raise ValueError("missing_env_file")
  for line in env_path.read_text().splitlines():
    if not line or line.strip().startswith("#"):
      continue
    key, _, value = line.partition("=")
    if key.strip() == "gemini_key":
      return value.strip().strip("\"").strip("'")
  raise ValueError("missing_gemini_key")

def _get_model() -> genai.Client:
  global _model
  if _model is None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
      raise ValueError("GEMINI_API_KEY is not set.")
    _model = genai.Client(api_key=api_key)
  return _model

def _fetch_image_for_uuid(image_uuid: str) -> bytes:
  client = _get_supabase_client()
  record = (
    client.table("submissions")
    .select("image_path")
    .eq("id", image_uuid)
    .single()
    .execute()
  )
  data = record.data or {}
  image_path = data.get("image_path")
  if not image_path:
    raise ValueError(f"No image_path found for {image_uuid}.")
  storage = client.storage.from_("submissions")
  return storage.download(image_path)


def _get_supabase_client():
  global _supabase
  if _supabase is None:
    supabase_url = os.getenv("supabase_api")
    supabase_key = os.getenv("supabase_key")
    if not supabase_url or not supabase_key:
      raise ValueError("supabase_api or supabase_key is not set.")
    _supabase = create_client(supabase_url, supabase_key)
  return _supabase

def _model_response(image_bytes: bytes) -> str:
  client = _get_model()
  contents = [
    PROMPT,
    types.Part.from_bytes(data=image_bytes, mime_type="image/jpeg"),
  ]
  response = client.models.generate_content(
    model=MODEL_NAME,
    contents=contents,
  )

  return (response.text or "").strip().lower()


def check_recapture(image_uuid: str) -> dict:
  image_bytes = _fetch_image_for_uuid(image_uuid)
  response_text = _model_response(image_bytes)
  is_screen = response_text.startswith("yes")
  if is_screen:
    return {"accept": False, "reason": "screen_recapture"}
  return {"accept": True}

if __name__ == "__main__":
  import os
  for file in os.listdir("assets/recapture-check"):
    if file.endswith(".jpg"):
      image_bytes = open(f"assets/recapture-check/{file}", "rb").read()
      result = check_recapture(image_bytes)
      print(f"{file} {result['accept']}")