"""Regenerate the small, redistributable PDF fixtures used by Spec 16.

The generated files are committed so the test suite never needs Pillow's
font stack, a network connection, or the developer-only source PDFs. Run this
script from ``backend`` only when intentionally changing a fixture:

    venv\\Scripts\\python.exe tests\\fixtures\\pdf\\generate.py

All content is synthetic and written for this project (no third-party
document text). The rendered pages use Arial when it is available; the
committed output is what the tests consume.
"""

from __future__ import annotations

import io
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DecodedStreamObject, DictionaryObject, NameObject

HERE = Path(__file__).resolve().parent

NORMAL_PAGES = [
    [
        "SABHA TERM SHEET",
        "Series V-007 dated 15 July 2019",
        "Issuer: Housing Development Finance Corporation Limited",
        "Amount: Rs. 2,000 crore",
        "Coupon: 7.87% p.a.",
        "ISIN: INE001A07AB1",
    ],
    [
        "REDEMPTION SCHEDULE",
        "Final maturity: 18 July 2022",
        "Rating: AAA (Stable)",
        "Security: Secured Redeemable Non-Convertible Debentures",
    ],
]

LETTER_SPACED_LINES = [
    "HDFC SERIES V-007",
    "HOUSING DEVELOPMENT FINANCE CORPORATION LIMITED",
    "AMOUNT RS 2 000 CRORE",
    "COUPON 7 87 PERCENT",
]

SCANNED_LINES = [
    "SCANNED TERM SHEET",
    "HDFC SERIES V-007",
    "Housing Development Finance Corporation Limited",
    "Rs. 2,000 crore",
    "7.87% p.a.",
]

NON_LATIN_LINES = [
    "ТЕРМ ШИТ",
    "ОБЛИГАЦИЯ СЕРИИ V-007",
    "СУММА 2000 КРОР",
]


def _font(size: int) -> ImageFont.ImageFont:
    for candidate in (
        r"C:\Windows\Fonts\arial.ttf",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ):
        try:
            return ImageFont.truetype(candidate, size)
        except OSError:
            continue
    return ImageFont.load_default()


def _escape(text: str) -> str:
    return text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _text_lines_content(lines: list[str], *, spaced: bool) -> bytes:
    if not spaced:
        body = []
        for line in lines:
            body.append(f"({_escape(line)}) Tj T*")
        commands = [
            "BT",
            "/F1 12 Tf",
            "72 740 Td",
            "18 TL",
            *body,
            "ET",
        ]
        return "\n".join(commands).encode("latin-1")

    # One TJ array per line with a large negative adjustment between glyphs
    # reproduces the single-character tokens seen in poor text layers.
    body = []
    for line in lines:
        items: list[str] = []
        for char in line:
            items.append(f"({_escape(char)})")
            if char != " ":
                items.append("-520")
        body.append("[" + " ".join(items) + "] TJ T*")
    commands = [
        "BT",
        "/F1 10 Tf",
        "72 740 Td",
        "20 TL",
        *body,
        "ET",
    ]
    return "\n".join(commands).encode("latin-1")


def _text_pdf(pages: list[list[str]], *, spaced_pages: set[int] | None = None) -> bytes:
    spaced_pages = spaced_pages or set()
    writer = PdfWriter()
    for index, lines in enumerate(pages):
        page = writer.add_blank_page(width=612, height=792)
        font = DictionaryObject(
            {
                NameObject("/Type"): NameObject("/Font"),
                NameObject("/Subtype"): NameObject("/Type1"),
                NameObject("/BaseFont"): NameObject("/Helvetica"),
                NameObject("/Encoding"): NameObject("/WinAnsiEncoding"),
            }
        )
        font_ref = writer._add_object(font)
        page[NameObject("/Resources")] = DictionaryObject(
            {
                NameObject("/Font"): DictionaryObject(
                    {NameObject("/F1"): font_ref}
                )
            }
        )
        stream = DecodedStreamObject()
        stream.set_data(
            _text_lines_content(lines, spaced=index in spaced_pages)
        )
        page[NameObject("/Contents")] = writer._add_object(stream)
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _render(lines: list[str]) -> Image.Image:
    image = Image.new("RGB", (1654, 2339), "white")
    draw = ImageDraw.Draw(image)
    font = _font(42)
    y = 220
    for line in lines:
        draw.text((180, y), line, fill="black", font=font)
        y += 110
    return image


def _image_pdf(lines: list[str]) -> bytes:
    image = _render(lines)
    buffer = io.BytesIO()
    image.save(buffer, format="PDF", resolution=200.0)
    return buffer.getvalue()


def _merge(*documents: bytes) -> bytes:
    writer = PdfWriter()
    for document in documents:
        writer.append(PdfReader(io.BytesIO(document)))
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def _encrypt(document: bytes, *, user_password: str) -> bytes:
    writer = PdfWriter(clone_from=PdfReader(io.BytesIO(document)))
    writer.encrypt(
        user_password=user_password,
        owner_password="spec16-owner-secret",
        algorithm="AES-128",
    )
    buffer = io.BytesIO()
    writer.write(buffer)
    return buffer.getvalue()


def main() -> None:
    normal = _text_pdf(NORMAL_PAGES)
    letter_spaced = _text_pdf([LETTER_SPACED_LINES], spaced_pages={0})
    scanned = _image_pdf(SCANNED_LINES)
    non_latin = _image_pdf(NON_LATIN_LINES)

    files = {
        "text.pdf": normal,
        "letter-spaced.pdf": letter_spaced,
        "image-only.pdf": scanned,
        "non-latin.pdf": non_latin,
        "mixed.pdf": _merge(
            _text_pdf([["MIXED DOCUMENT PAGE ONE", "Normal text page"]]),
            scanned,
            _text_pdf([["FINAL TEXT PAGE THREE", "Text layer after the scan"]]),
        ),
        "blank.pdf": _text_pdf([[]]),
        "encrypted-empty-password.pdf": _encrypt(normal, user_password=""),
        "encrypted-password.pdf": _encrypt(normal, user_password="spec16-secret"),
        "malformed.pdf": b"%PDF-1.7\n1 0 obj\n<< /Type /Catalog",
    }
    for name, content in files.items():
        (HERE / name).write_bytes(content)
        print(f"wrote {name}: {len(content)} bytes")


if __name__ == "__main__":
    main()
