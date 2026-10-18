from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import meetings, participants, personas, settings as settings_api, documents, knowledge_stacks

app = FastAPI(
    title="Sabha API",
    description="Multi-Agent AI Advisory Board Backend",
    version="0.1.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _ensure_demo_guard(app: "FastAPI") -> None:
    """Deny mutating API calls before dispatch when running in demo mode.

    Demo is a no-write replay workspace: reads stay open (no-auth API is kept),
    but POST/PUT/PATCH/DELETE to any /api endpoint returns 403 before routing
    so no route handler ever executes a write. Full local/hosted runtimes are
    unaffected.
    """
    from fastapi import Request
    from fastapi.responses import JSONResponse

    @app.middleware("http")
    async def demo_write_guard(request: Request, call_next):
        if settings.runtime_mode == "demo":
            if request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path.startswith("/api"):
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Demo workspace is read-only — mutations are disabled"},
                )
        return await call_next(request)


_ensure_demo_guard(app)


# Include routers
app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(participants.router, prefix="/api/participants", tags=["participants"])
app.include_router(personas.router)
app.include_router(settings_api.router)
app.include_router(documents.router)
app.include_router(knowledge_stacks.router)


@app.get("/")
async def root():
    return {"message": "Sabha API", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
