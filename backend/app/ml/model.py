import torch
import torch.nn as nn
from torchvision.models import efficientnet_b0
import logging
from pathlib import Path

logger = logging.getLogger("airq.ml")

class AirQualityModel(nn.Module):
    def __init__(self, model_path: Path, device: str = None):
        super().__init__()
        if device is None:
            self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        else:
            self.device = torch.device(device)
            
        # Architecture matching fineweights.pt
        self.backbone = efficientnet_b0().features
        self.pool = nn.AdaptiveAvgPool2d((1, 1))
        self.head = nn.Sequential(
            nn.Linear(1280, 256),
            nn.ReLU(),
            nn.Dropout(p=0.2),
            nn.Linear(256, 64),
            nn.ReLU(),
            nn.Linear(64, 1)
        )
        
        self.to(self.device)
        self._load_weights(model_path)
        self.eval()

    def _load_weights(self, path: Path):
        logger.info(f"Loading regression model on {self.device}")
        if not path.exists():
            logger.error(f"Weights file not found at {path}")
            raise FileNotFoundError(f"Model weights not found at {path}")
            
        state_dict = torch.load(path, map_location=self.device)
        new_state = {}
        for k, v in state_dict.items():
            if k.startswith('module.backbone.features.'):
                new_state[k.replace('module.backbone.features.', 'backbone.')] = v
            elif k.startswith('module.head.'):
                new_state[k.replace('module.head.', 'head.')] = v

        self.load_state_dict(new_state)
        logger.info("Model weights loaded successfully.")

    def _features(self, tensor: torch.Tensor) -> torch.Tensor:
        """Run the frozen backbone and return pooled feature vectors."""
        x = self.backbone(tensor.to(self.device))
        x = self.pool(x)
        return torch.flatten(x, 1)

    @torch.no_grad()
    def predict(self, tensor: torch.Tensor) -> float:
        """
        Runs inference on a preprocessed image tensor.
        Returns the raw scalar output of the regression head.
        """
        return self.head(self._features(tensor)).item()

    @torch.no_grad()
    def predict_with_uncertainty(self, tensor: torch.Tensor, n_samples: int = 20) -> tuple[float, float]:
        """
        Monte-Carlo dropout estimate of prediction uncertainty.

        The backbone is deterministic and runs once; only the dropout-bearing
        head is re-sampled, so the extra cost over predict() is negligible.

        Returns (mean, std) of the raw head output across n_samples passes.
        A wide spread means the features land in a region the head has not
        learned confidently — the basis for a real confidence score.
        """
        features = self._features(tensor)

        dropouts = [m for m in self.head.modules() if isinstance(m, nn.Dropout)]
        if not dropouts or n_samples < 2:
            # No stochastic layers to sample: uncertainty is unavailable.
            return self.head(features).item(), 0.0

        for m in dropouts:
            m.train()  # re-enable dropout without disturbing BatchNorm
        try:
            samples = torch.cat([self.head(features) for _ in range(n_samples)])
        finally:
            for m in dropouts:
                m.eval()

        mean = samples.mean().item()
        std = samples.std(unbiased=True).item()
        logger.debug("[MODEL] mc_dropout: n=%d | mean=%.4f | std=%.4f", n_samples, mean, std)
        return mean, std
