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

    @torch.no_grad()
    def predict(self, tensor: torch.Tensor) -> float:
        """
        Runs inference on a preprocessed image tensor.
        Returns the estimated PM2.5 scalar value.
        """
        tensor = tensor.to(self.device)
        x = self.backbone(tensor)
        x = self.pool(x)
        x = torch.flatten(x, 1)
        pm25_estimate = self.head(x)
        return pm25_estimate.item()
