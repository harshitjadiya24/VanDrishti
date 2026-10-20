# Models, sources and licences

Each model is downloaded in the phase that first uses it, by `scripts/download_models.py`,
with the publisher's checksum verified; nothing downloads at run time.

| Model | Section | Status | Weights | Code | Licence |
|---|---|---|---|---|---|
| MegaDetector V6, MIT compact (`MDV6-mit-yolov9-c`, 9.7 M params) | 5.2 | in use (Phase 2) | Zenodo record 15398270, `MDV6-mit-yolov9-c.ckpt` (118.9 MB, md5 d8626ba2…) + `config_v9s.yaml` | bundled MIT YOLOv9 subset (`models/adapters/vendor/yolo_mit`) | weights CC-BY-4.0 (Microsoft Pytorch-Wildlife model weights); code MIT (MultimediaTechLab/YOLO; Microsoft PytorchWildlife) |
| SpeciesNet v4.0.3a crop classifier (EfficientNet V2 M, 2,498 labels incl. tiger, leopard, chital, sambar, dhole, gaur, sloth bear) | 5.3 | in use (Phase 3) | Kaggle `google/speciesnet/pyTorch/v4.0.3a/1` via kagglehub into `data/models/kagglehub` (488 MB, includes an unused MegaDetector v5 file); geofence release 20260609 | `speciesnet==5.0.6` in its own environment `tools/speciesnet` (ADR 0004) | Apache-2.0 (repository; Kaggle page gives no separate weights licence) |
| OpenCLIP ViT-B/16, LAION-2B s34B b88K | 5.4, 6 (vehicle type guess) | in use (Phases 3, 5), informational | HF `laion/CLIP-ViT-B-16-laion2B-s34B-b88K` @ 7288da5a, `open_clip_model.safetensors` (598.5 MB, sha256 3f25d29d…) | `open-clip-torch` 3.3 | MIT |
| SAM 2.1 hiera-tiny | 5.5 | in use (Phase 3), CPU | HF `facebook/sam2.1-hiera-tiny` @ de431c40, `model.safetensors` (155.9 MB, sha256 48c14467…), transformers format | `transformers` 5.20 (`Sam2Model`) | Apache-2.0 |
| MegaDescriptor-T-224 (BVRA, Swin-T, 28 M params, trained for animal re-identification) | 10.5 | **in use (Phase 6), default** | HF `BVRA/MegaDescriptor-T-224` @ 3ea58ff6, `pytorch_model.bin` (204.3 MB, sha256 62f53e63…); a training checkpoint (weights under `"model"`, old timm Swin layout, converted with timm's `checkpoint_filter_fn`) | `timm` | **CC-BY-NC-4.0** per the model card (its config says "mit"; the stricter card applies): **non-commercial use only** |
| DINOv2-small (Meta, ViT-S/14) | 10.5 | measured, not default | HF `facebook/dinov2-small` @ ed25f3a3, `model.safetensors` (88.2 MB, sha256 ae1e99fc…) | `transformers` (`Dinov2Model`, CLS token) | Apache-2.0 |
| FAISS (`faiss-cpu`, exact inner-product index) | 9, 10.5 | in use (Phase 6) | — | `faiss-cpu` | MIT |

Why not the `PytorchWildlife` package: version 1.3.0 requires `ultralytics` (AGPL-3.0),
`yolov5`, `gradio`, `lightning` and more (several GB). The MIT detector needs only ~1,450
lines of MIT code plus PyTorch, so that subset is bundled with its licences (ADR 0003).
Checkpoints are loaded with `torch.load(weights_only=True)` and must fill every layer.

MegaDescriptor's non-commercial licence binds any deployment that uses it: a commercial or
paid deployment must switch `VANDRISHTI_REID_MODEL=dinov2-small` (Apache-2.0, measured worse
at telling unknown tigers apart; see EVALUATION.md) or obtain another licence. ATRW
(the evaluation data) is CC BY-NC-SA 4.0 and stays in git-ignored `data/`.

