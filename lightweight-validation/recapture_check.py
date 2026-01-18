from __future__ import annotations

from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image
from keras.models import load_model

_ROOT_DIR = Path(__file__).resolve().parent
_MOIRE_DIR = _ROOT_DIR / "moire-pattern-detector"

import sys
if str(_MOIRE_DIR) not in sys.path:
  sys.path.insert(0, str(_MOIRE_DIR))

from haar2D import fwdHaarDWT2D
from mCNN import createModel

CONFIG = {
  "weightsPath": _ROOT_DIR / "moire_detector_weights.keras",
  "height": 375,
  "width": 500,
  "depth": 1,
  "numClasses": 2,
  "moireThreshold": 0.5,
}

_MODEL = None

def _load_model():
  global _MODEL
  if _MODEL is not None:
    return _MODEL

  weights_path = CONFIG["weightsPath"]
  if not weights_path.exists():
    fallback_path = _MOIRE_DIR / "moirePattern3CNN_.keras"
    weights_path = fallback_path if fallback_path.exists() else weights_path

  try:
    _MODEL = load_model(weights_path, compile=False)
  except Exception:
    _MODEL = createModel(
      CONFIG["height"],
      CONFIG["width"],
      CONFIG["depth"],
      CONFIG["numClasses"],
    )
    _MODEL.load_weights(weights_path)

  return _MODEL


def _scale_range(data: np.ndarray, min_val: float, max_val: float) -> np.ndarray:
  data = data.astype(np.float32)
  data_min = float(data.min())
  data_max = float(data.max())
  if data_max == data_min:
    return np.zeros_like(data, dtype=np.float32)
  scaled = (data - data_min) / (data_max - data_min)
  return scaled * (max_val - min_val) + min_val


def _prepare_inputs(image_bytes: bytes) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
  image = Image.open(BytesIO(image_bytes))
  w, h = image.size
  if h > w:
    image = image.resize((750, 1000))
  else:
    image = image.resize((1000, 750))

  image = image.convert("L")
  if image.size[1] > image.size[0]:
    image = image.rotate(-90, expand=1)

  ll, lh, hl, hh = fwdHaarDWT2D(image)
  ll = _scale_range(ll, 0.0, 1.0)
  lh = _scale_range(lh, -1.0, 1.0)
  hl = _scale_range(hl, -1.0, 1.0)
  hh = _scale_range(hh, -1.0, 1.0)

  height = CONFIG["height"]
  width = CONFIG["width"]
  ll = ll.reshape((1, height, width, 1))
  lh = lh.reshape((1, height, width, 1))
  hl = hl.reshape((1, height, width, 1))
  hh = hh.reshape((1, height, width, 1))

  return ll, lh, hl, hh


def check_recapture(image_bytes: bytes) -> dict:
  model = _load_model()
  ll, lh, hl, hh = _prepare_inputs(image_bytes)
  preds = model.predict([ll, lh, hl, hh], verbose=0)
  moire_score = float(preds[0][0])
  moire_detected = moire_score >= CONFIG["moireThreshold"]
  if moire_detected:
    return {"accept": False, "reason": "moire_detected", "score": moire_score}
  return {"accept": True, "score": moire_score}