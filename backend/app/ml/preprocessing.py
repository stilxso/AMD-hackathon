import io
from PIL import Image, UnidentifiedImageError
import torch
from torchvision import transforms

class ImagePreprocessor:
    def __init__(self, img_size: int = 224):
        self.img_size = img_size
        self.transform = transforms.Compose([
            transforms.Resize((self.img_size, self.img_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

    def process_bytes(self, image_bytes: bytes) -> torch.Tensor:
        """
        Takes raw image bytes, opens with PIL, applies transforms,
        and returns a batch-ready tensor (shape: [1, 3, H, W]).
        """
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert('RGB')
        except UnidentifiedImageError as e:
            raise ValueError(f"Invalid or unsupported image format: {e}")
            
        tensor = self.transform(image)
        # Add batch dimension
        return tensor.unsqueeze(0)
