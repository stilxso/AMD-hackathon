"""
Build the sky reference bank used by the out-of-distribution gate.

The gate answers "does this photo look like anything the model was meant to
see?" by measuring cosine distance in the backbone's feature space to a bank
of known-good sky photographs. This script produces that bank.

Usage:
    python -m scripts.build_sky_bank <image-dir> [-o sky_bank.npz]

<image-dir> should contain sky / skyline photographs only — the same kind of
image the app asks users to take. Photographs, not paintings or renders: the
bank defines "normal", so anything in it is something the gate will accept.

Rebuilding against the actual training set (Kaggle: air-pollution-image-dataset
-from-india-and-nepal + pm25vision, see the training notebook) will give a
tighter bank than the small public sample shipped in the repo.
"""
import argparse
import logging
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.ml.model import AirQualityModel
from app.ml.preprocessing import ImagePreprocessor

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("build_sky_bank")

SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("image_dir", type=Path)
    ap.add_argument("-o", "--out", type=Path, default=Path("sky_bank.npz"))
    ap.add_argument("--model", type=Path, default=Path(settings.model_path))
    args = ap.parse_args()

    paths = sorted(p for p in args.image_dir.rglob("*") if p.suffix.lower() in SUFFIXES)
    if not paths:
        logger.error("No images found under %s", args.image_dir)
        return 1

    model = AirQualityModel(args.model)
    pre = ImagePreprocessor()

    vectors, used = [], []
    for p in paths:
        try:
            tensor = pre.process_bytes(p.read_bytes())
        except ValueError as e:
            logger.warning("skip %s: %s", p.name, e)
            continue
        with torch.no_grad():
            vectors.append(model.features(tensor).cpu().numpy()[0])
        used.append(p.name)

    if not vectors:
        logger.error("No image decoded successfully")
        return 1

    bank = np.stack(vectors).astype(np.float32)
    bank /= np.maximum(np.linalg.norm(bank, axis=1, keepdims=True), 1e-9)

    np.savez_compressed(args.out, features=bank, names=np.array(used))
    logger.info("Wrote %s — %d vectors of dim %d", args.out, *bank.shape)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
