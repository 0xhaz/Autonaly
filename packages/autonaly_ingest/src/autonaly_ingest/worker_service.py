"""Cloud Run wrapper around the pull worker.

Cloud Run services must answer HTTP on $PORT; a Pub/Sub *pull* subscriber
never listens on a socket, so deploying `worker.py` directly fails the
platform's startup probe.

The alternative would be converting to a push subscription — but that moves
retry and dead-letter handling out of the subscription this project already
exercises (five delivery attempts, then the DLQ topic, verified by the
malformed-signal replay) and into HTTP status codes, replacing tested
behaviour days before a deadline. So the proven loop runs on a daemon thread
and this module satisfies the HTTP contract.

Deployed with min-instances=1 and CPU always allocated: a scaled-to-zero or
CPU-throttled instance would stop pulling between requests, which for a
subscriber means silently processing nothing.
"""

from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Response

from .worker import run_worker

log = logging.getLogger(__name__)

_worker_thread: threading.Thread | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _worker_thread
    logging.basicConfig(level=logging.INFO, format="  %(message)s")
    _worker_thread = threading.Thread(target=run_worker, name="pubsub-worker", daemon=True)
    _worker_thread.start()
    log.info("pull worker started on a background thread")
    yield


app = FastAPI(title="Autonaly worker", lifespan=lifespan)


@app.get("/health")
def health() -> Response:
    """503 once the subscriber thread dies, so a wedged instance is visible
    rather than quietly accepting traffic it will never act on."""
    alive = _worker_thread is not None and _worker_thread.is_alive()
    return Response(
        content='{"status":"ok","subscriber":"running"}'
        if alive
        else '{"status":"degraded","subscriber":"stopped"}',
        media_type="application/json",
        status_code=200 if alive else 503,
    )
