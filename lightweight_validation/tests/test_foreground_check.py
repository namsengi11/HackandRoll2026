import csv
import sys
import pytest

from pathlib import Path
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

from HackandRoll2026.vlm_verification.app import app


ASSETS_DIR = Path(__file__).resolve().parents[1] / "assets" / "foreground-check"
GROUND_TRUTH_CSV = ASSETS_DIR / "foreground-check.csv"
client = TestClient(app)


def _iter_images():
  for path in sorted(ASSETS_DIR.glob("*.jpg")):
    yield path
  for path in sorted(ASSETS_DIR.glob("*.jpeg")):
    yield path


def _load_images():
  if not ASSETS_DIR.exists():
    pytest.skip(f"assets directory not found: {ASSETS_DIR}")
  images = list(_iter_images())
  if not images:
    pytest.skip(f"no jpg images found in: {ASSETS_DIR}")
  return images


def _load_ground_truth():
  if not GROUND_TRUTH_CSV.exists():
    pytest.skip(f"ground truth csv not found: {GROUND_TRUTH_CSV}")
  truth = {}
  with GROUND_TRUTH_CSV.open("r", encoding="utf-8") as handle:
    reader = csv.reader(handle)
    for row in reader:
      if not row:
        continue
      filename = row[0].strip()
      label = row[1].strip().lower() if len(row) > 1 else ""
      if not filename or label not in {"yes", "no"}:
        continue
      truth[filename] = label == "yes"
  if not truth:
    pytest.skip(f"no valid rows found in: {GROUND_TRUTH_CSV}")
  return truth


@pytest.mark.parametrize("image_path", _load_images())
def test_foreground_check(image_path: Path):
  ground_truth = _load_ground_truth()
  assert image_path.name in ground_truth
  with image_path.open("rb") as handle:
    files = {"file": (image_path.name, handle, "image/jpeg")}
    response = client.post("/foreground-check", files=files)

  assert response.status_code == 200
  payload = response.json()
  assert "accept" in payload
  assert payload["accept"] == ground_truth[image_path.name]

  if payload["accept"] is False:
    assert "reason" in payload

