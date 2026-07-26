import logging
from pathlib import Path

import numpy as np

logger = logging.getLogger("airq.ml")


class SkyReferenceBank:
    """
    Out-of-distribution gate for the PM2.5 regressor.

    The regression head has no reject option: every image produces a number,
    so a photo of a carpet yields a confident-looking PM2.5 estimate. Nothing
    in the head can signal "this is not a sky". This gate supplies that signal
    from the backbone's feature space instead.

    An image is scored by cosine distance to its k nearest neighbours in a bank
    of known sky photographs. Sky photos land near the bank; anything else does
    not. Measured on 43 sky photographs against 41 non-sky images (carpets,
    keyboards, interiors, food, pets, brick, text), this separates the two with
    AUC 0.98 — see scripts/build_sky_bank.py to rebuild the bank.

    kNN distance rather than Mahalanobis: with a bank of a few dozen vectors in
    1280 dimensions the covariance is rank-deficient, and the Mahalanobis
    distance it yields ranks non-sky images *closer* to the centre than real
    sky photos. Nearest-neighbour distance needs no covariance estimate.
    """

    def __init__(self, bank_path: Path, k: int, threshold: float):
        data = np.load(bank_path)
        self.bank: np.ndarray = data["features"]
        self.k = min(k, len(self.bank))
        self.threshold = threshold
        logger.info(
            "Sky reference bank loaded: %d vectors, k=%d, threshold=%.3f",
            len(self.bank), self.k, threshold,
        )

    def distance(self, features: np.ndarray) -> float:
        """
        Cosine distance from `features` to the mean of its k nearest sky
        neighbours. 0 means identical to known sky, larger means less like it.
        """
        v = features / max(float(np.linalg.norm(features)), 1e-9)
        similarities = self.bank @ v
        return float(1.0 - np.sort(similarities)[-self.k:].mean())
