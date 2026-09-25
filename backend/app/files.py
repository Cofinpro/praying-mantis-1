"""Helpers for uploaded files, shared by training materials and expense receipts."""

import re
import unicodedata

# The first bytes of each format we accept somewhere. Checking them (not just the name or the
# Content-Type the client sends) means a file is what it says it is.
is_pdf = lambda b: b.startswith(b"%PDF-")  # noqa: E731
is_zip = lambda b: b.startswith(b"PK\x03\x04")  # noqa: E731  (.docx, .pptx and .xlsx are zip files too)
is_png = lambda b: b.startswith(b"\x89PNG\r\n\x1a\n")  # noqa: E731
is_jpeg = lambda b: b.startswith(b"\xff\xd8\xff")  # noqa: E731
is_webp = lambda b: b[:4] == b"RIFF" and b[8:12] == b"WEBP"  # noqa: E731


def is_utf8_text(data: bytes) -> bool:
    try:
        data.decode("utf-8")
    except UnicodeDecodeError:
        return False
    return b"\x00" not in data


def clean_filename(raw: str | None) -> str:
    """The name to store and to offer on download: no folders, no control characters, at most 255 chars.

    Browsers send only the base name, but other clients may send "C:\\Users\\me\\slides.pdf" or "../x".
    """
    name = re.split(r"[\\/]", raw or "")[-1]
    name = "".join(c for c in unicodedata.normalize("NFC", name) if unicodedata.category(c)[0] != "C")
    name = re.sub(r"\s+", " ", name).strip(" .")
    if len(name) > 255:  # keep the extension
        stem, dot, ext = name.rpartition(".")
        name = f"{stem[: 254 - len(ext)]}.{ext}" if dot and len(ext) < 20 else name[:255]
    return name


def extension(filename: str) -> str:
    """".pdf" for "Slides.PDF"; "" when there's no dot."""
    return "." + filename.rpartition(".")[2].lower() if "." in filename else ""
