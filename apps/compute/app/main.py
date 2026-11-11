from __future__ import annotations

import os
from typing import Any

import httpx
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from .forecast import simulate
from .parse_poll import extract_notice

app = FastAPI(title="Vive la France 2027 — compute", version="0.1.0")


class CandidateInput(BaseModel):
    id: str
    poll_avg: float = 0.0
    market_prob: float = 0.0


class ForecastRequest(BaseModel):
    candidates: list[CandidateInput] = Field(default_factory=list)
    draws: int = Field(default=20000, ge=1000, le=100000)
    seed: int = 42


class PollRequest(BaseModel):
    url: str | None = None
    text: str | None = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {"ok": True, "service": "vlf-compute", "version": "0.1.0"}


@app.post("/forecast")
def forecast(request: ForecastRequest) -> dict[str, Any]:
    return simulate([candidate.model_dump() for candidate in request.candidates], request.draws, request.seed)


@app.post("/parse-poll")
async def parse_poll(request: PollRequest) -> dict[str, Any]:
    if request.text:
        return {"ok": True, "mode": "text", "results": [], "warnings": ["Text parsing is not supported yet."]}

    if not request.url:
        raise HTTPException(status_code=400, detail="url or text is required")

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        response = await client.get(request.url)
        if response.status_code != 200:
            raise HTTPException(status_code=502, detail=f"PDF fetch failed: {response.status_code}")
        return extract_notice(response.content, request.url)


@app.post("/backfill")
def backfill() -> dict[str, Any]:
    return {"ok": True, "status": "not_implemented", "note": "Historical ETL lands in P2."}
