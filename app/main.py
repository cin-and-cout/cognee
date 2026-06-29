from fastapi import FastAPI

from app.api.websocket import router as ws_router

app = FastAPI(
    title="Claim Consistency Tracker API",
    description="Real-time speech self-consistency tracking using Cognee temporal graph memory.",
    version="1.0.0",
)

# Register API routes
app.include_router(ws_router)


@app.get("/")
async def root():
    return {
        "status": "ok",
        "message": "Claim Consistency Tracker API is running.",
    }
