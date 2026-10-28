"""Read a replay package directory into inert, typed data.

The loader never imports or executes anything from the package. It enforces
path safety and bounded sizes, parses the manifest, and reads only the
declared checkpoints, tapes, retrieval records, and assets. Semantic checks
(hashes, identities, policy agreement, event ordering) live in
``validate.py`` so the publish tool can re-run them against staged rows.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Mapping

from pydantic import ValidationError

from .issues import PackageIssue, PackageLoadError
from .model import (
    AssetIndex,
    Checkpoint,
    ClosingTape,
    Manifest,
    RetrievalRecord,
    TurnTape,
)

MAX_PACKAGE_BYTES = 25 * 1024 * 1024
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_FILES = 500


@dataclass(frozen=True)
class LoadedPackage:
    root: Path
    manifest: Manifest
    checkpoints: Mapping[str, Checkpoint]
    tapes: Mapping[str, TurnTape]
    closing_tapes: Mapping[str, ClosingTape]
    retrievals: Mapping[str, RetrievalRecord]
    assets: AssetIndex
    asset_bytes: Mapping[str, bytes]
    file_hashes: Mapping[str, str]
    content_sha256: str


def _iter_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise PackageLoadError(
                [PackageIssue("symlink", path.as_posix(), "package files must not be symlinks")]
            )
        if path.is_file():
            files.append(path)
    return files


def _relative(root: Path, path: Path) -> str:
    relative = path.relative_to(root).as_posix()
    if relative.startswith("/") or ".." in relative.split("/"):
        raise PackageLoadError(
            [PackageIssue("unsafe_path", relative, "file escapes the package root")]
        )
    return relative


def _read_json(root: Path, relative: str) -> Any:
    path = root / relative
    if not path.is_file():
        raise PackageLoadError(
            [PackageIssue("missing_file", relative, "referenced file is missing")]
        )
    raw = path.read_bytes()
    if len(raw) > MAX_FILE_BYTES:
        raise PackageLoadError(
            [PackageIssue("file_too_large", relative, "file exceeds the per-file cap")]
        )
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise PackageLoadError(
            [PackageIssue("invalid_json", relative, str(exc))]
        ) from exc


def _parse(model, payload, relative: str):
    try:
        return model.model_validate(payload)
    except ValidationError as exc:
        raise PackageLoadError(
            [
                PackageIssue(
                    "invalid_shape",
                    relative,
                    exc.errors(include_url=False)[0]["msg"]
                    if exc.errors()
                    else "invalid shape",
                )
            ]
        ) from exc


def compute_content_sha256(
    file_hashes: Mapping[str, str],
    manifest: Mapping[str, Any] | None = None,
) -> str:
    """Hash the package content deterministically.

    Every content file is included by relative path and content hash, in
    sorted order. When the manifest payload is supplied it is bound too, with
    the ``content_sha256`` field itself excluded so the digest can be stored
    back into the manifest.
    """

    digest = hashlib.sha256()
    for relative in sorted(file_hashes):
        if relative == "manifest.json":
            continue
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(bytes.fromhex(file_hashes[relative]))
    if manifest is not None:
        canonical = json.dumps(
            {key: value for key, value in manifest.items() if key != "content_sha256"},
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=True,
        )
        digest.update(b"manifest.json\0")
        digest.update(canonical.encode("utf-8"))
    return digest.hexdigest()


def load_package(root: Path | str) -> LoadedPackage:
    root_path = Path(root).resolve()
    if not root_path.is_dir():
        raise PackageLoadError(
            [PackageIssue("missing_package", str(root), "package directory not found")]
        )

    files = _iter_files(root_path)
    if len(files) > MAX_FILES:
        raise PackageLoadError(
            [PackageIssue("too_many_files", root_path.name, "package has too many files")]
        )

    file_hashes: dict[str, str] = {}
    total = 0
    for path in files:
        relative = _relative(root_path, path)
        raw = path.read_bytes()
        total += len(raw)
        if len(raw) > MAX_FILE_BYTES:
            raise PackageLoadError(
                [PackageIssue("file_too_large", relative, "file exceeds the per-file cap")]
            )
        file_hashes[relative] = hashlib.sha256(raw).hexdigest()
    if total > MAX_PACKAGE_BYTES:
        raise PackageLoadError(
            [PackageIssue("package_too_large", root_path.name, "package exceeds the size cap")]
        )

    manifest_payload = _read_json(root_path, "manifest.json")
    manifest = _parse(Manifest, manifest_payload, "manifest.json")

    checkpoints: dict[str, Checkpoint] = {}
    for checkpoint_id in manifest.checkpoints:
        relative = f"checkpoints/{checkpoint_id}.json"
        checkpoints[checkpoint_id] = _parse(
            Checkpoint, _read_json(root_path, relative), relative
        )

    tapes: dict[str, TurnTape] = {}
    for tape_id in manifest.tapes:
        relative = f"tapes/{tape_id}.json"
        tapes[tape_id] = _parse(TurnTape, _read_json(root_path, relative), relative)

    closing_tapes: dict[str, ClosingTape] = {}
    for tape_id in manifest.closing_tapes:
        relative = f"closing_tapes/{tape_id}.json"
        closing_tapes[tape_id] = _parse(
            ClosingTape, _read_json(root_path, relative), relative
        )

    retrievals: dict[str, RetrievalRecord] = {}
    for retrieval_key in manifest.retrieval:
        relative = f"retrieval/{retrieval_key}.json"
        retrievals[retrieval_key] = _parse(
            RetrievalRecord, _read_json(root_path, relative), relative
        )

    assets = AssetIndex(assets=[])
    asset_bytes: dict[str, bytes] = {}
    if "assets/index.json" in file_hashes:
        assets = _parse(
            AssetIndex, _read_json(root_path, "assets/index.json"), "assets/index.json"
        )
        for record in assets.assets:
            relative = f"assets/{record.path}"
            if relative not in file_hashes:
                raise PackageLoadError(
                    [
                        PackageIssue(
                            "missing_asset",
                            relative,
                            "asset file named by assets/index.json is missing",
                        )
                    ]
                )
            asset_bytes[record.path] = (root_path / relative).read_bytes()

    return LoadedPackage(
        root=root_path,
        manifest=manifest,
        checkpoints=checkpoints,
        tapes=tapes,
        closing_tapes=closing_tapes,
        retrievals=retrievals,
        assets=assets,
        asset_bytes=asset_bytes,
        file_hashes=file_hashes,
        content_sha256=compute_content_sha256(file_hashes, manifest_payload),
    )
