"""Inference-only subset of the MIT-licensed "YOLO" (YOLOv9) implementation.

Source: MultimediaTechLab/YOLO (MIT, Copyright (c) 2024 Kin-Yiu Wong and Hao-Tang Tsui),
as bundled in Microsoft PytorchWildlife 1.3.0 (MIT, PytorchWildlife/models/detection/
yolo_mit/yolo). Licences: LICENSE-YOLO, LICENSE-PytorchWildlife.

Taken: config.py, model/module.py → module.py, model/yolo.py → yolo.py,
utils/bounding_box_utils.py. Changed (marked "VanDrishti:"): relative imports; no weight
downloading; torch.load(weights_only=True); YOLOv7 anchor decoder removed. Not taken:
training, data loading, dataset download tools. Not type-checked or linted as our code.
"""

from .bounding_box_utils import Vec2Box, bbox_nms, create_converter
from .yolo import YOLO, create_model

__all__ = ["YOLO", "Vec2Box", "bbox_nms", "create_converter", "create_model"]
