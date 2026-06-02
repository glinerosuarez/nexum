from __future__ import annotations

import os

import uvicorn

from nexum_api.app import app


if __name__ == "__main__":
    host = os.getenv("NEXUM_API_HOST", "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("NEXUM_API_PORT", "8080")))
    uvicorn.run(app, host=host, port=port)
