#!/usr/bin/env python3
"""
Entry point to start the AirQ backend server.

Usage:
    python run.py
    # or
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
"""

import uvicorn
from app.config import settings


def main():
    """Launch the uvicorn server with settings from .env."""
    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        log_level=settings.log_level,
        reload=True,  # auto-reload during development
    )


if __name__ == "__main__":
    main()
