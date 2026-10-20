"""VanDrishti ↔ SpeciesNet bridge, run inside this isolated environment (ADR 0004).

    uv run --project tools/speciesnet python tools/speciesnet/run_vandrishti.py \
        request.json response.json

Request:  {"model": "kaggle:google/speciesnet/pyTorch/v4.0.3a/1", "country": "IND",
           "admin1_region": null, "max_classifications": 5,
           "items": [{"filepath": "/abs/img.jpg",
                      "detections": [{"category": "1", "label": "animal", "conf": 0.9,
                                      "bbox": [x, y, w, h]}]}]}
Response: {"model_version": ..., "predictions": [SpeciesNet ensemble predictions]}

Only the classifier and the ensemble (geofence + label rollup) are loaded: the detections
come from VanDrishti's MegaDetector V6, so SpeciesNet's own detector is never downloaded.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from speciesnet import SpeciesNet


def main() -> None:
    request_path, response_path = Path(sys.argv[1]), Path(sys.argv[2])
    req = json.loads(request_path.read_text())
    instances = {
        "instances": [
            {"filepath": it["filepath"], "country": req.get("country"),
             **({"admin1_region": req["admin1_region"]} if req.get("admin1_region") else {})}
            for it in req["items"]
        ]
    }
    detections = {
        it["filepath"]: {"filepath": it["filepath"], "detections": it["detections"]}
        for it in req["items"]
    }
    k = int(req.get("max_classifications", 5))
    classifier = SpeciesNet(req["model"], components="classifier")
    classified = classifier.classify(
        instances_dict=instances,
        detections_dict=detections,
        batch_size=int(req.get("batch_size", 8)),
        max_classifications_per_detection=k,
    )
    by_path = {p["filepath"]: p for p in (classified or {}).get("predictions", [])}
    ensemble = SpeciesNet(req["model"], components="ensemble", geofence=True)
    combined = ensemble.ensemble_from_past_runs(
        instances_dict=instances,
        classifications_dict=by_path,
        detections_dict=detections,
        max_classifications_per_detection=k,
    )
    response_path.write_text(json.dumps(combined or {}, indent=1))


if __name__ == "__main__":
    main()
