from __future__ import annotations as _annotations

from contextlib import asynccontextmanager

import fastapi
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core import router as core_router
from app.db import Database
from app.login import CurrentUser, NotAuthenticatedException
from app.login import router as login_router


@asynccontextmanager
async def lifespan(_app: fastapi.FastAPI):
    async with Database.connect() as db:
        _app.state.db = db
        yield
        delattr(_app.state, "db")


app = fastapi.FastAPI(lifespan=lifespan)
app.include_router(login_router)
app.include_router(core_router)
# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Next.js default port
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],  # Explicitly specify DELETE
    allow_headers=["*"],
)


@app.get("/")
async def index(user: CurrentUser) -> str:
    return f"Hello, {user}!"


@app.exception_handler(NotAuthenticatedException)
async def not_authenticated_exception_handler(request: Request, exc: NotAuthenticatedException):
    return JSONResponse(
        status_code=401,
        content={"detail": "Not authenticated"},
    )
