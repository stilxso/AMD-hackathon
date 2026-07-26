"""
Refit the sky/not-sky probe that gates the PM2.5 regressor.

    python -m scripts.build_sky_probe <sky-dir> <non-sky-dir> [-o sky_probe.npz]

<sky-dir> should hold photographs the model is expected to answer for, and
<non-sky-dir> whatever it should refuse. Both matter: the probe learns the
boundary between them, so a narrow non-sky set yields a gate that only refuses
what it has seen. The shipped weights were fitted on 250 sky photographs (clear,
overcast, night, hazy, sunset, contrails, skylines, sky between buildings, sky
through branches) against 263 non-sky images (rooms, food, pets, screens,
documents, textures, portraits, tools, shop interiors, satellite and space
imagery).

Images are encoded with CLIP, not with the PM2.5 backbone. That backbone is
fine-tuned to predict PM2.5 and discards the semantic content this gate needs;
on identical data a probe over its features reaches AUC 0.963 against 0.997
here. Pass --encoder to try another timm model, and the probe records which one
it was fitted on so the two cannot drift apart.

The threshold is chosen by grouped cross-validation, not from the fit itself:
in-sample margins are optimistic and would put the boundary in the wrong place.
Images whose filenames share a stem are held out together, because photo sets
from one shoot are near-duplicates and would otherwise leak across folds.
"""

import argparse
import re
import sys
from pathlib import Path

import numpy as np
import timm
import torch
from PIL import Image, ImageOps
from scipy.optimize import minimize

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

DEFAULT_ENCODER = "vit_base_patch32_clip_224.openai"

# Weak L2 was best across a sweep: heavier penalties cost separation without
# improving cross-validated AUC.
L2 = 1e-4

# Share of genuine sky photographs the gate is willing to turn away. Refusing a
# real sky is the more visible failure, and the encoder separates the classes
# well enough that being this permissive costs almost no rejection power.
REJECT_BUDGET = 0.5


def load_features(directory: Path, model, transform):
    """Encoder features, L2-normalised, one row per readable image."""
    vectors, names = [], []
    for path in sorted(directory.rglob("*")):
        if path.suffix.lower() not in EXTENSIONS:
            continue
        try:
            image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
        except Exception as exc:
            print(f"  skipped {path.name}: {exc}")
            continue
        with torch.no_grad():
            v = model(transform(image).unsqueeze(0)).numpy()[0]
        vectors.append(v / max(float(np.linalg.norm(v)), 1e-9))
        names.append(path.name)
    if not vectors:
        raise SystemExit(f"No readable images in {directory}")
    return np.stack(vectors), names


def fit(X: np.ndarray, y: np.ndarray) -> tuple[np.ndarray, float]:
    """Class-balanced L2-regularised logistic regression."""
    weight = np.where(y == 1, 1.0 / y.sum(), 1.0 / (1 - y).sum()) * len(y) / 2
    sign = 2 * y - 1

    def objective(params):
        w, b = params[:-1], params[-1]
        a = -sign * (X @ w + b)
        loss = (weight * np.logaddexp(0, a)).sum() / len(y) + L2 * w @ w
        grad = weight * (-sign) / (1 + np.exp(-a)) / len(y)
        return loss, np.r_[X.T @ grad + 2 * L2 * w, grad.sum()]

    result = minimize(objective, np.zeros(X.shape[1] + 1), jac=True,
                      method="L-BFGS-B", options={"maxiter": 4000})
    return result.x[:-1], float(result.x[-1])


def fold_assignments(names: list[str], n_folds: int = 5) -> np.ndarray:
    """Group near-duplicate series onto the same fold via their filename stem."""
    def stem(name: str) -> str:
        s = re.sub(r"\.[^.]+$", "", name).lower()
        s = re.sub(r"[\(\)\[\]_,\-]+", " ", s)
        s = re.sub(r"\b(img|image|photo|no|nr)?\s*\d+\b", " ", s)
        return " ".join(s.split()[:4])

    groups = np.array([stem(n) for n in names])
    unique = sorted(set(groups))
    np.random.default_rng(0).shuffle(unique)
    lookup = {g: i % n_folds for i, g in enumerate(unique)}
    return np.array([lookup[g] for g in groups])


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sky_dir", type=Path, help="Directory of sky photographs")
    parser.add_argument("non_sky_dir", type=Path, help="Directory of everything else")
    parser.add_argument("-o", "--out", type=Path, default=Path("sky_probe.npz"))
    parser.add_argument("--encoder", default=DEFAULT_ENCODER,
                        help="timm model used to embed the images")
    args = parser.parse_args()

    model = timm.create_model(args.encoder, pretrained=True, num_classes=0).eval()
    transform = timm.data.create_transform(
        **timm.data.resolve_data_config({}, model=model))

    print(f"Reading sky images from {args.sky_dir} …")
    P, p_names = load_features(args.sky_dir, model, transform)
    print(f"Reading non-sky images from {args.non_sky_dir} …")
    N, n_names = load_features(args.non_sky_dir, model, transform)

    X = np.r_[P, N]
    y = np.r_[np.ones(len(P)), np.zeros(len(N))]
    names = p_names + n_names
    folds = fold_assignments(names)

    scores = np.zeros(len(y))
    for k in range(folds.max() + 1):
        train = folds != k
        w, b = fit(X[train], y[train])
        scores[folds == k] = X[folds == k] @ w + b

    threshold = float(np.percentile(scores[y == 1], REJECT_BUDGET))
    order = np.argsort(scores)
    ranks = np.empty(len(scores))
    ranks[order] = np.arange(len(scores))
    auc = ((ranks[y == 1].sum() - len(P) * (len(P) - 1) / 2) / (len(P) * len(N)))

    print(f"\nCross-validated AUC      {auc:.3f}")
    print(f"Threshold                {threshold:+.3f}")
    print(f"Sky photographs accepted {(scores[y == 1] >= threshold).mean() * 100:.1f}%")
    print(f"Non-sky refused          {(scores[y == 0] < threshold).mean() * 100:.1f}%")

    w, b = fit(X, y)
    np.savez_compressed(args.out, w=w.astype(np.float32), b=np.float32(b),
                        threshold=np.float32(threshold),
                        encoder=np.array(args.encoder))
    print(f"\nWrote {args.out}")


if __name__ == "__main__":
    main()
