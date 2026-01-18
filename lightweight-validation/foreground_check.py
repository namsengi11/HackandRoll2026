import cv2
import numpy as np
from ultralytics import YOLO

CONFIG = {
  "maxSide": 960,
  "imgsz": 960,
  "modelPath": "yolov8l-world.pt",
  "classPrompt": ["object", "item", "artifact", "central object", "foreground", "non-background"],
  "conf": 0.01,
  "iou": 0.4,
  "minPrimaryAreaRatio": 0.03,
  "maxPrimaryAreaRatio": 0.90,
  "maxCenterDistanceRatio": 0.35,
  "secondaryAreaRatio": 0.30,
  "secondaryDistanceRatio": 1.3,
}

def _load_model(config: dict=CONFIG) -> YOLO:
  _model = YOLO(config["modelPath"])
  if "classPrompt" in config and config["classPrompt"]:
    _model.set_classes(config["classPrompt"])
  return _model

def _decode_jpeg(image_bytes: bytes) -> np.ndarray | None:
  data = np.frombuffer(image_bytes, dtype=np.uint8)
  image = cv2.imdecode(data, cv2.IMREAD_COLOR)
  return image


def _resize_if_needed(image: np.ndarray, max_side: int) -> np.ndarray:
  h, w = image.shape[:2]
  max_dim = max(h, w)
  if max_dim <= max_side:
    return image
  scale = max_side / max_dim
  new_w = int(w * scale)
  new_h = int(h * scale)
  return cv2.resize(image, (new_w, new_h), interpolation=cv2.INTER_AREA)


def _yolo_boxes(image: np.ndarray) -> list[tuple[float, float, float, float]]:
  model = _load_model()
  results = model.predict(
    source=image,
    conf=CONFIG["conf"],
    verbose=False,
    agnostic_nms=True,
    iou=CONFIG["iou"],
    imgsz=CONFIG["imgsz"],
  )
  if not results:
    return []
  boxes = results[0].boxes
  if boxes is None or len(boxes) == 0:
    return []
  xyxy = boxes.xyxy.cpu().numpy()
  return [(float(x1), float(y1), float(x2), float(y2)) for x1, y1, x2, y2 in xyxy]


def _evaluate_proposals(
  image_shape: tuple[int, int, int],
  boxes: list[tuple[float, float, float, float]],
) -> dict:
  h, w = image_shape[:2]
  image_area = float(h * w)
  image_center = (w / 2.0, h / 2.0)

  scored = []
  for x1, y1, x2, y2 in boxes:
    bw = max(0.0, x2 - x1)
    bh = max(0.0, y2 - y1)
    area = bw * bh
    if area <= 0:
      continue
    area_ratio = area / image_area
    cx = x1 + (bw / 2.0)
    cy = y1 + (bh / 2.0)
    dx = (cx - image_center[0]) / w
    dy = (cy - image_center[1]) / h
    center_distance_ratio = float((dx * dx + dy * dy) ** 0.5)
    scored.append((center_distance_ratio, area_ratio))

  if not scored:
    return {"accept": False, "reason": "no_object"}

  scored.sort(key=lambda item: item[0])
  # Take center object as primary object
  primary_center_dist, primary_area = scored[0]

  for center_distance_ratio, area_ratio in scored[1:]:
    if primary_center_dist * CONFIG["secondaryDistanceRatio"] >= center_distance_ratio:
      return {"accept": False, "reason": "multiple_objects"}

  if primary_center_dist > CONFIG["maxCenterDistanceRatio"]:
    return {"accept": False, "reason": "off_center"}
  if primary_area < CONFIG["minPrimaryAreaRatio"]:
    return {"accept": False, "reason": "object_too_small"}
  if primary_area > CONFIG["maxPrimaryAreaRatio"]:
    return {"accept": False, "reason": "object_too_large"}

  return {"accept": True}


def check_foreground(image_bytes: bytes) -> dict:
  image = _decode_jpeg(image_bytes)
  if image is None:
    raise ValueError("invalid_jpeg")

  image = _resize_if_needed(image, CONFIG["maxSide"])
  boxes = _yolo_boxes(image)
  return _evaluate_proposals(image.shape, boxes)


def render_segmentation(image_bytes: bytes, alpha: float = 0.5) -> bytes:
  image = _decode_jpeg(image_bytes)
  if image is None:
    raise ValueError("invalid_jpeg")

  image = _resize_if_needed(image, CONFIG["maxSide"])
  boxes = _yolo_boxes(image)

  overlay = image.copy()
  for x1, y1, x2, y2 in boxes:
    cv2.rectangle(overlay, (int(x1), int(y1)), (int(x2), int(y2)), (0, 255, 0), 2)
  blended = cv2.addWeighted(overlay, alpha, image, 1 - alpha, 0)

  ok, encoded = cv2.imencode(".jpg", blended)
  if not ok:
    raise ValueError("encode_failed")

  return encoded.tobytes()

