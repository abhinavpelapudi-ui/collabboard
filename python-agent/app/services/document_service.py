"""Document parsing service for PDF, DOCX, and TXT files."""

import io
import logging

logger = logging.getLogger(__name__)


def parse_pdf(file_bytes: bytes) -> dict:
    """Extract text and metadata from a PDF file."""
    from PyPDF2 import PdfReader

    reader = PdfReader(io.BytesIO(file_bytes))
    pages = []
    for page in reader.pages:
        text = page.extract_text() or ""
        pages.append(text)

    full_text = "\n\n".join(pages)
    return {
        "content": full_text,
        "metadata": {
            "page_count": len(reader.pages),
            "word_count": len(full_text.split()),
            "char_count": len(full_text),
        },
    }


def parse_docx(file_bytes: bytes) -> dict:
    """Extract text and metadata from a DOCX file."""
    from docx import Document

    doc = Document(io.BytesIO(file_bytes))
    paragraphs = [p.text for p in doc.paragraphs if p.text.strip()]
    full_text = "\n\n".join(paragraphs)

    return {
        "content": full_text,
        "metadata": {
            "paragraph_count": len(paragraphs),
            "word_count": len(full_text.split()),
            "char_count": len(full_text),
        },
    }


def parse_txt(file_bytes: bytes) -> dict:
    """Read a plain text file."""
    text = file_bytes.decode("utf-8", errors="replace")
    return {
        "content": text,
        "metadata": {
            "word_count": len(text.split()),
            "char_count": len(text),
        },
    }


def parse_document(file_bytes: bytes, file_type: str) -> dict:
    """Parse a document based on its file type.

    Args:
        file_bytes: Raw file content
        file_type: One of 'pdf', 'docx', 'txt'

    Returns:
        dict with 'content' (str) and 'metadata' (dict)
    """
    parsers = {
        "pdf": parse_pdf,
        "docx": parse_docx,
        "txt": parse_txt,
    }
    parser = parsers.get(file_type)
    if not parser:
        raise ValueError(f"Unsupported file type: {file_type}")

    return parser(file_bytes)
