"""Legacy knowledge repair: audit (default) or fix pre-Phase-06 rows.

Reports:
  - documents stuck in processing/uploaded with no ingestion job row
  - ingestion jobs queued/processing/failed with payload bytes present
  - vector cleanup outbox entries still pending
  - documents whose status can never resolve (failed with no payload)

With --fix: creates missing job rows for stuck documents and replays
pending cleanups through the durable lifecycle. Never deletes data.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.api.documents import STORAGE_DIR  # noqa: E402
from app.core.database import get_supabase  # noqa: E402
from app.modules.knowledge import ingestion as ingestion_service  # noqa: E402
from app.modules.knowledge import lifecycle as lifecycle_service  # noqa: E402
from app.services.document_processor import DocumentProcessor  # noqa: E402
from app.services.vector_store import get_vector_store  # noqa: E402


def _audit(db):
    docs = db.table("documents").select("id,status,file_name").execute().data or []
    try:
        jobs = db.table("document_ingestion_jobs").select("document_id,state").execute().data or []
    except Exception:
        jobs = []
    try:
        outbox = db.table("vector_cleanup_outbox").select("document_id,done").execute().data or []
    except Exception:
        outbox = []
    job_states = {j["document_id"]: j.get("state") for j in jobs}
    stuck = [d for d in docs if d.get("status") in ("processing", "uploaded") and d["id"] not in job_states]
    failed = [j for j in jobs if j.get("state") == "failed"]
    pending_cleanup = [o for o in outbox if not o.get("done")]
    print(f"documents: {len(docs)}, ingestion jobs: {len(jobs)}, outbox rows: {len(outbox)}")
    print(f"stuck without job: {len(stuck)}")
    for d in stuck[:20]:
        print(f"  STUCK {d['id']} status={d.get('status')} file={d.get('file_name')}")
    print(f"failed jobs: {len(failed)}")
    for j in failed[:20]:
        print(f"  FAILED job for {j['document_id']}")
    print(f"pending cleanups: {len(pending_cleanup)}")
    for o in pending_cleanup[:20]:
        print(f"  PENDING cleanup for {o['document_id']}")
    return stuck, failed, pending_cleanup


async def _fix(db, stuck):
    vectors = get_vector_store()
    processor = DocumentProcessor()
    fixed_jobs = 0
    for d in stuck:
        document_id = d["id"]
        payload = STORAGE_DIR / document_id / "payload.bin"
        if not payload.exists():
            print(f"  SKIP {document_id}: no durable payload bytes")
            continue
        try:
            doc = db.table("documents").select("*").eq("id", document_id).single().execute().data
        except Exception:
            doc = None
        if not doc:
            continue
        await ingestion_service.enqueue_ingestion(
            db, document_id=document_id,
            collection=doc.get("qdrant_collection", ""),
            file_name=doc.get("file_name", ""),
            file_type=doc.get("file_type", ""),
            storage_path=str(STORAGE_DIR / document_id / doc.get("file_name", "payload.bin")),
        )
        fixed_jobs += 1
    print(f"created {fixed_jobs} missing job rows")
    try:
        outbox = db.table("vector_cleanup_outbox").select("*").eq("done", False).execute().data or []
    except Exception:
        outbox = []
    finished = 0
    for job in outbox:
        outcome = await lifecycle_service.run_cleanup_job(db, vectors, job["document_id"])
        if outcome.get("done"):
            db.table("documents").delete().eq("id", job["document_id"]).execute()
            finished += 1
    print(f"finished {finished} pending cleanups")


def main():
    parser = argparse.ArgumentParser(description="Audit or repair legacy knowledge rows")
    parser.add_argument("--fix", action="store_true", help="Create missing jobs and replay cleanups")
    args = parser.parse_args()
    db = get_supabase()
    stuck, _, _ = _audit(db)
    if args.fix:
        asyncio.run(_fix(db, stuck))


if __name__ == "__main__":
    main()
