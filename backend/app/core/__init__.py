# Platform seam package. Import submodules directly (app.core.database,
# app.core.config, app.core.qdrant); this __init__ must stay side-effect
# free so `app.core.config` remains importable without any SDK client.
