import logging
from pathlib import Path

import numpy as np
import timm
import torch
from PIL import Image

logger = logging.getLogger("airq.ml")


class SkyProbe:
    """
    Out-of-distribution gate for the PM2.5 regressor.

    The regression head has no reject option: every image produces a number,
    so a photo of a carpet yields a confident-looking PM2.5 estimate. Nothing
    in the head can signal "this is not a sky". This gate supplies that signal.

    It runs its own CLIP image encoder and scores the result with a linear
    probe — one dot product — trained on 250 sky photographs against 263
    non-sky images (rooms, food, pets, screens, documents, textures, portraits,
    tools, shop interiors, plus satellite and space imagery). Positive means
    sky. Under grouped 5-fold cross-validation this reaches AUC 0.997: at the
    shipped threshold it accepts 99% of real sky photographs while refusing 97%
    of everything else. See scripts/build_sky_probe.py to refit.

    A separate encoder rather than the regressor's own features, which is what
    the first two versions of this gate used. That backbone is fine-tuned to
    predict PM2.5, so it discards the semantic content the gate needs; probes
    fitted on it top out at AUC 0.963, and the reference-bank version before it
    at 0.888. The same probe on general-purpose features reaches 0.997. The cost
    is a second forward pass, about 90 ms and 350 MB of weights.
    """

    def __init__(self, probe_path: Path, threshold: float | None = None):
        data = np.load(probe_path, allow_pickle=True)
        self.w: np.ndarray = data["w"]
        self.b: float = float(data["b"])
        # The fitted threshold travels with the weights, since the two are only
        # meaningful together. Config may still override it to retune the gate.
        self.threshold: float = (
            float(data["threshold"]) if threshold is None else threshold
        )

        # The encoder name is stored with the weights: a probe is only valid for
        # the feature space it was fitted on, so the two must not drift apart.
        encoder = str(data["encoder"])
        self.model = timm.create_model(encoder, pretrained=True, num_classes=0).eval()
        config = timm.data.resolve_data_config({}, model=self.model)
        self.transform = timm.data.create_transform(**config)
        logger.info(
            "Sky probe loaded: encoder=%s dim=%d threshold=%.3f",
            encoder, len(self.w), self.threshold,
        )

    @torch.no_grad()
    def score(self, image: Image.Image) -> float:
        """
        Signed margin: how sky-like the image is. At or above `threshold` the
        image is accepted, and the further above, the more confidently a sky.
        """
        tensor = self.transform(image).unsqueeze(0)
        features = self.model(tensor).numpy()[0]
        v = features / max(float(np.linalg.norm(features)), 1e-9)
        return float(v @ self.w + self.b)
