import os

from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from app.api.websocket import router as ws_router

app = FastAPI(
    title="Claim Consistency Tracker API",
    description="Real-time speech self-consistency tracking using Cognee temporal graph memory.",
    version="1.0.0",
)

# Resolve static directories
current_dir = os.path.dirname(__file__)
static_path = os.path.join(current_dir, "static")
templates_path = os.path.join(current_dir, "templates")

# Mount static folder if it exists
if os.path.exists(static_path):
    app.mount("/static", StaticFiles(directory=static_path), name="static")

templates = Jinja2Templates(directory=templates_path) if os.path.exists(templates_path) else None

# Register API routes
app.include_router(ws_router)


@app.get("/", response_class=HTMLResponse)
async def root(request: Request):
    if templates:
        return templates.TemplateResponse(
            request=request,
            name="index.html",
            context={},
        )
    return HTMLResponse("templates directory or index.html not found.")
