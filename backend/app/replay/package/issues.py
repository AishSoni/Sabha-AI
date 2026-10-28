"""Validation findings shared by the loader, validator, and publish tool."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PackageIssue:
    code: str
    path: str
    detail: str

    def render(self) -> str:
        return f"{self.code} [{self.path}]: {self.detail}"


class PackageLoadError(Exception):
    """A package could not be read as data at all."""

    def __init__(self, issues: list[PackageIssue]):
        self.issues = tuple(issues)
        super().__init__("; ".join(issue.render() for issue in issues))
