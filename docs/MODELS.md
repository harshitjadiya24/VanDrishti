# Models, sources and licences

Each model is downloaded in the phase that first uses it, by `scripts/download_models.py`,
with the publisher's checksum verified; nothing downloads at run time.

| Model | Section | Status | Weights | Code | Licence |
|---|---|---|---|---|---|
| MegaDetector V6, MIT compact (`MDV6-mit-yolov9-c`, 9.7 M params) | 5.2 | in use (Phase 2) | Zenodo record 15398270, `MDV6-mit-yolov9-c.ckpt` (118.9 MB, md5 d8626ba2…) + `config_v9s.yaml` | bundled MIT YOLOv9 subset (`models/adapters/vendor/yolo_mit`) | weights CC-BY-4.0 (Microsoft Pytorch-Wildlife model weights); code MIT (MultimediaTechLab/YOLO; Microsoft PytorchWildlife) |
| SpeciesNet | 5.3 | Phase 3 | — | — | to verify |
| OpenCLIP ViT-B/16 | 5.4 | Phase 3 | — | — | to verify |
| SAM 2.1 tiny | 5.5 | Phase 3 | — | — | to verify |
| Re-identification embedder | 10.5 | Phase 6 | — | — | to verify (some are non-commercial) |

Why not the `PytorchWildlife` package: version 1.3.0 requires `ultralytics` (AGPL-3.0),
`yolov5`, `gradio`, `lightning` and more (several GB). The MIT detector needs only ~1,450
lines of MIT code plus PyTorch, so that subset is bundled with its licences (ADR 0003).
Checkpoints are loaded with `torch.load(weights_only=True)` and must fill every layer.
