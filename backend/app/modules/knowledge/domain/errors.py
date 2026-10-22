"""Knowledge domain errors with stable presentation categories."""

from __future__ import annotations


class KnowledgeError(Exception):
    """Base class for knowledge use-case failures."""

    code = "knowledge_error"


class InvalidOwner(KnowledgeError):
    code = "invalid_owner"


class InvalidTransition(KnowledgeError):
    code = "invalid_transition"


class UploadRejected(KnowledgeError):
    code = "upload_rejected"

    def __init__(self, message: str, *, code: str | None = None) -> None:
        super().__init__(message)
        if code is not None:
            self.code = code


class UnsupportedFileType(UploadRejected):
    code = "unsupported_file_type"


class SourceTooLarge(UploadRejected):
    code = "source_too_large"


class MissingSource(KnowledgeError):
    code = "missing_source"


class KnowledgeUnavailable(KnowledgeError):
    """The durable knowledge store cannot be reached or returned garbage."""

    code = "knowledge_unavailable"
