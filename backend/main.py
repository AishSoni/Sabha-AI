from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.api import meetings, participants, personas, settings as settings_api

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

# Include routers
app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings"])
app.include_router(participants.router, prefix="/api/participants", tags=["participants"])
app.include_router(personas.router)
app.include_router(settings_api.router)


@app.get("/")
async def root():
    return {"message": "Sabha API", "version": "0.1.0"}


@app.get("/health")
async def health_check():
    return {"status": "healthy"}
