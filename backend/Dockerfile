FROM python:3.11-slim

WORKDIR /app

# CPU-only torch first — the default PyPI wheels pull ~2.5 GB of CUDA the
# container never uses. The requirements install below then finds them satisfied.
RUN pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu \
    torch torchvision

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Bake the sky gate's CLIP encoder into the image. Without this the first
# upload after every cold start blocks on a 350 MB download, and a container
# with no outbound network never serves a prediction at all.
RUN python -c "import numpy as np, timm; \
    timm.create_model(str(np.load('sky_probe.npz', allow_pickle=True)['encoder']), \
    pretrained=True, num_classes=0)"

# Expose port
EXPOSE 8000

HEALTHCHECK --interval=10s --timeout=5s --start-period=60s --retries=10 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')"

# Run FastAPI using Uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
