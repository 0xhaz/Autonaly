"""ArtifactStore adapters — the one port needing two real implementations.

There is no official GCS emulator, so instead of running fake-gcs-server we own
the boundary. The local root mirrors the bucket key layout 1:1, which makes
cutover a `gsutil rsync` plus a settings flip (workplan.md §1).
"""

from __future__ import annotations

from pathlib import Path


class LocalArtifactStore:
    """Filesystem-backed. Keys are POSIX-style paths relative to `root`."""

    def __init__(self, root: Path) -> None:
        self.root = Path(root)
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.root / key).resolve()
        if not path.is_relative_to(self.root.resolve()):
            raise ValueError(f"key escapes artifact root: {key!r}")
        return path

    def read(self, key: str) -> bytes:
        return self._path(key).read_bytes()

    def write(self, key: str, data: bytes) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()

    def list(self, prefix: str = "") -> list[str]:
        base = self.root.resolve()
        return sorted(
            key
            for p in base.rglob("*")
            if p.is_file() and (key := str(p.relative_to(base))).startswith(prefix)
        )


class GCSArtifactStore:
    """GCS-backed. Same key layout as LocalArtifactStore."""

    def __init__(self, bucket: str, project: str | None = None) -> None:
        from google.cloud import storage

        self._client = storage.Client(project=project)
        self._bucket = self._client.bucket(bucket)

    def read(self, key: str) -> bytes:
        return self._bucket.blob(key).download_as_bytes()

    def write(self, key: str, data: bytes) -> None:
        self._bucket.blob(key).upload_from_string(data)

    def exists(self, key: str) -> bool:
        return self._bucket.blob(key).exists()

    def list(self, prefix: str = "") -> list[str]:
        return sorted(b.name for b in self._client.list_blobs(self._bucket, prefix=prefix))
