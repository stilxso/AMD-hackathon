import io
from PIL import Image, ImageOps, UnidentifiedImageError
import torch
from torchvision import transforms

class ImagePreprocessor:
    def __init__(self, img_size: int = 224):
        self.img_size = img_size
        # Resize-short-side + centre-crop preserves aspect ratio. Squashing a
        # 4:3 phone photo to a square distorts the horizon and haze gradient
        # the model keys on, and mismatches the standard ImageNet eval
        # transform the backbone was pretrained with.
        self.transform = transforms.Compose([
            transforms.Resize(int(self.img_size * 256 / 224)),
            transforms.CenterCrop(self.img_size),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
        ])

    def decode(self, image_bytes: bytes) -> Image.Image:
        """
        Raw bytes to an upright RGB image. Separate from process_bytes because
        the sky gate runs its own encoder with its own transform, and decoding
        the upload twice would be wasted work.

        Raises ValueError for input that is not a decodable image.
        """
        try:
            image = Image.open(io.BytesIO(image_bytes))
            # Phone cameras record rotation in EXIF rather than rotating pixels;
            # without this a portrait photo reaches the model on its side.
            return ImageOps.exif_transpose(image).convert('RGB')
        except (UnidentifiedImageError, OSError, ValueError) as e:
            raise ValueError(f"Invalid or unsupported image format: {e}")

    def process_bytes(self, image_bytes: bytes) -> torch.Tensor:
        """
        Takes raw image bytes, opens with PIL, applies transforms,
        and returns a batch-ready tensor (shape: [1, 3, H, W]).

        Raises ValueError for input that is not a decodable image.
        """
        return self.process_image(self.decode(image_bytes))

    def process_image(self, image: Image.Image) -> torch.Tensor:
        """Transform an already-decoded image into a batch-ready tensor."""
        return self.transform(image).unsqueeze(0)
