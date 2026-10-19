"""Uvicorn entrypoint (``uvicorn main:app``).

Application assembly lives in the composition root (``app.bootstrap``);
this module only exposes the application instance.
"""

from app.bootstrap import create_app

app = create_app()
