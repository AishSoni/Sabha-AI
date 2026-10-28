"""
Document processor for parsing and chunking files.
Supports PDF, DOCX, XLSX, CSV, TXT, and MD formats.
"""

from dataclasses import dataclass
import io
import logging
from typing import Callable, List, BinaryIO

from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.modules.knowledge.infrastructure.pdf_extraction import (
    PdfExtraction,
    extract_pdf,
    extract_pdf_bounded,
)

logger = logging.getLogger(__name__)

# Extraction budgets (spec-02 E2): parsing materializes everything it is
# given, so huge workbooks/texts would freeze ingestion and exhaust memory.
# Budgets are truncations, not errors — a capped document still ingests the
# portion within budget. Values are read at call time so tests can lower
# them; note the parser still materializes the full bytes it was handed.
MAX_ROWS_PER_SHEET = 50_000
MAX_EXTRACT_CHARACTERS = 2_000_000


def budgeted_rows(rows, max_rows):
    """Yield at most `max_rows` items from `rows` (a pure iterator cap)."""
    if max_rows is None:
        yield from rows
        return
    for i, row in enumerate(rows):
        if i >= max_rows:
            logger.warning(
                "Row budget %s reached; remaining rows were not extracted", max_rows
            )
            return
        yield row


@dataclass
class DocumentChunk:
    """A chunk of text extracted from a document."""
    text: str
    chunk_index: int
    metadata: dict


@dataclass
class ProcessedDocument:
    """Chunks plus the extraction provenance persisted with the revision."""

    chunks: List[DocumentChunk]
    extraction_method: str | None = None
    extraction_version: str | None = None
    page_count: int | None = None
    ocr_page_count: int = 0


class DocumentProcessor:
    """
    Handles document parsing and text chunking.

    Extracts text from various file formats and splits into
    overlapping chunks suitable for embedding and retrieval.
    """

    def __init__(
        self,
        chunk_size: int = 500,
        chunk_overlap: int = 50,
        *,
        pdf_extractor: Callable[[bytes], PdfExtraction] | None = None,
    ):
        """
        Initialize the document processor.

        Args:
            chunk_size: Target size of each chunk in characters
            chunk_overlap: Number of overlapping characters between chunks
            pdf_extractor: PDF extraction callable; production injects the
                isolated child-process implementation.
        """
        self.chunk_size = chunk_size
        self.chunk_overlap = chunk_overlap
        self._pdf_extractor = pdf_extractor or extract_pdf
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""]
        )

    def parse_file(
        self,
        file_content: BinaryIO | bytes,
        file_name: str,
        file_type: str
    ) -> str:
        """
        Extract text content from a file.

        Args:
            file_content: File content as bytes or file-like object
            file_name: Original file name
            file_type: File extension/type (pdf, docx, xlsx, csv, txt, md)

        Returns:
            Extracted text content

        PDF text is page-aware internally, but this compatibility surface
        joins the accepted pages. Use ``process_document`` when page locators
        and extraction provenance are needed.
        """
        content_bytes = self._read_bytes(file_content)
        return self._cap_text(self._extract_text(content_bytes, file_name, file_type))

    @staticmethod
    def _read_bytes(file_content: BinaryIO | bytes) -> bytes:
        if hasattr(file_content, "read"):
            return file_content.read()
        return file_content

    def _extract_text(
        self, content_bytes: bytes, file_name: str, file_type: str
    ) -> str:
        file_type = file_type.lower().lstrip(".")

        if file_type == "pdf":
            return self._pdf_extractor(content_bytes).text

        parsers = {
            "docx": self._parse_docx,
            "xlsx": self._parse_xlsx,
            "csv": self._parse_csv,
            "txt": self._parse_text,
            "md": self._parse_text,
            "markdown": self._parse_text,
        }
        parser = parsers.get(file_type)
        if not parser:
            raise ValueError(
                f"Unsupported file type: {file_type}. Supported: "
                f"['pdf', {', '.join(repr(name) for name in parsers)}]"
            )
        return parser(content_bytes)

    @staticmethod
    def _cap_text(text: str) -> str:
        """Clamp extracted text to MAX_EXTRACT_CHARACTERS (truncate, not fail)."""
        cap = MAX_EXTRACT_CHARACTERS  # module-global read: monkeypatchable
        if cap is not None and len(text) > cap:
            logger.warning(
                "Extracted text truncated at the %s character budget", cap
            )
            return text[:cap]
        return text

    def process_document(
        self,
        file_content: BinaryIO | bytes,
        file_name: str,
        file_type: str,
        additional_metadata: dict | None = None,
    ) -> ProcessedDocument:
        """Extract and chunk, preserving PDF page locators and provenance."""
        content_bytes = self._read_bytes(file_content)
        normalized_type = file_type.lower().lstrip(".")
        metadata = {
            "file_name": file_name,
            "file_type": file_type,
            **(additional_metadata or {}),
        }

        if normalized_type != "pdf":
            text = self._cap_text(
                self._extract_text(content_bytes, file_name, normalized_type)
            )
            return ProcessedDocument(
                chunks=self.chunk_text(text, metadata),
                extraction_method="builtin",
                extraction_version="1",
            )

        extraction = self._pdf_extractor(content_bytes)
        chunks: list[DocumentChunk] = []
        for page in extraction.pages:
            if not page.text.strip():
                continue
            page_chunks = self.chunk_text(
                page.text,
                {**metadata, "page_number": page.page_number},
            )
            chunks.extend(page_chunks)
        for index, chunk in enumerate(chunks):
            chunk.chunk_index = index
            chunk.metadata["chunk_index"] = index
            chunk.metadata["total_chunks"] = len(chunks)
        return ProcessedDocument(
            chunks=chunks,
            extraction_method=extraction.extraction_method,
            extraction_version=extraction.extraction_version,
            page_count=extraction.page_count,
            ocr_page_count=len(extraction.ocr_page_numbers),
        )

    def _parse_docx(self, content: bytes) -> str:
        """Parse DOCX file using python-docx."""
        from docx import Document

        doc = Document(io.BytesIO(content))
        text_parts = []

        for para in doc.paragraphs:
            if para.text.strip():
                text_parts.append(para.text)

        # Also extract text from tables
        for table in doc.tables:
            for row in table.rows:
                row_text = " | ".join(cell.text.strip() for cell in row.cells if cell.text.strip())
                if row_text:
                    text_parts.append(row_text)

        return "\n\n".join(text_parts)

    def _parse_xlsx(self, content: bytes) -> str:
        """Parse XLSX/XLS file using openpyxl."""
        from openpyxl import load_workbook

        wb = load_workbook(io.BytesIO(content), data_only=True)
        text_parts = []

        for sheet_name in wb.sheetnames:
            sheet = wb[sheet_name]
            text_parts.append(f"## Sheet: {sheet_name}")

            # Row budget: stop pulling rows once the cap is reached so a
            # huge sheet cannot dominate ingestion.
            for row in budgeted_rows(sheet.iter_rows(), MAX_ROWS_PER_SHEET):
                row_values = [str(cell.value) for cell in row if cell.value is not None]
                if row_values:
                    text_parts.append(" | ".join(row_values))

        return "\n".join(text_parts)

    def _parse_csv(self, content: bytes) -> str:
        """Parse CSV file."""
        import csv

        text = content.decode("utf-8", errors="ignore")
        reader = csv.reader(io.StringIO(text))
        rows = [" | ".join(row) for row in reader if any(row)]

        return "\n".join(rows)

    def _parse_text(self, content: bytes) -> str:
        """Parse plain text or markdown file."""
        return content.decode("utf-8", errors="ignore")

    def chunk_text(
        self,
        text: str,
        metadata: dict | None = None
    ) -> List[DocumentChunk]:
        """
        Split text into overlapping chunks.

        Args:
            text: Full text content to chunk
            metadata: Additional metadata to attach to each chunk

        Returns:
            List of DocumentChunk objects
        """
        if not text.strip():
            return []

        chunks = self.text_splitter.split_text(text)
        base_metadata = metadata or {}

        return [
            DocumentChunk(
                text=chunk,
                chunk_index=i,
                metadata={**base_metadata, "chunk_index": i, "total_chunks": len(chunks)}
            )
            for i, chunk in enumerate(chunks)
        ]

    def process_file(
        self,
        file_content: BinaryIO | bytes,
        file_name: str,
        file_type: str,
        additional_metadata: dict | None = None
    ) -> List[DocumentChunk]:
        """
        Parse a file and split into chunks in one step.

        Args:
            file_content: File content
            file_name: Original file name
            file_type: File extension
            additional_metadata: Extra metadata for chunks

        Returns:
            List of DocumentChunk objects ready for embedding
        """
        return self.process_document(
            file_content,
            file_name,
            file_type,
            additional_metadata,
        ).chunks


from app.modules.knowledge.application.ports import ParsedChunk, ParsedDocument


class LocalDocumentParser:
    """``DocumentParser`` over the established extraction budgets."""

    def __init__(self, processor: DocumentProcessor | None = None) -> None:
        self._processor = processor or DocumentProcessor(
            pdf_extractor=extract_pdf_bounded
        )

    def parse(
        self, data: bytes, *, file_name: str, file_type: str
    ) -> ParsedDocument:
        processed = self._processor.process_document(data, file_name, file_type)
        return ParsedDocument(
            chunks=[
                ParsedChunk(
                    text=chunk.text,
                    chunk_index=chunk.chunk_index,
                    page_number=chunk.metadata.get("page_number"),
                )
                for chunk in processed.chunks
            ],
            extraction_method=processed.extraction_method,
            extraction_version=processed.extraction_version,
            page_count=processed.page_count,
            ocr_page_count=processed.ocr_page_count,
        )
