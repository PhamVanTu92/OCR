"""
OCR extraction using Gemini 2.5 Flash.

Supports:
  - PDF  → converts each page to a PNG via PyMuPDF, then sends to Gemini Vision
  - Images (JPG / PNG / WEBP) → sent directly

Returns raw extracted text (preserving layout as much as possible).
"""

import io
import base64
import logging
from pathlib import Path

import google.generativeai as genai
from PIL import Image

from app.core.config import settings

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.GEMINI_API_KEY)

SUPPORTED_MIME: dict[str, str] = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".webp": "image/webp",
}

_OCR_PROMPT = (
    "Extract ALL text from this document image. "
    "Preserve the original layout including tables, headers, line breaks, and columns. "
    "Return only the extracted text — no commentary."
)


def _model() -> genai.GenerativeModel:
    return genai.GenerativeModel(settings.GEMINI_MODEL)


def _pil_to_part(pil_image: Image.Image) -> Image.Image:
    """Return a PIL image that the Gemini SDK accepts directly."""
    return pil_image


async def extract_text_from_file(file_path: str) -> str:
    """
    Main entry point.  Given a local file path, return a single string
    containing all OCR-extracted text.
    """
    ext = Path(file_path).suffix.lower()

    if ext == ".pdf":
        return _extract_pdf(file_path)
    elif ext in SUPPORTED_MIME:
        return _extract_image(file_path)
    else:
        raise ValueError(f"Unsupported file extension: {ext!r}")


# ─── PDF ─────────────────────────────────────────────────────────────────────

def _extract_pdf(file_path: str) -> str:
    try:
        import fitz  # PyMuPDF
    except ImportError:
        raise RuntimeError("PyMuPDF is required for PDF support: pip install PyMuPDF")

    model = _model()
    page_texts: list[str] = []

    doc = fitz.open(file_path)
    total = len(doc)
    logger.info("Extracting text from PDF '%s' (%d pages)", file_path, total)

    for page_num in range(total):
        page = doc[page_num]
        # 2× zoom gives sharper images → better OCR accuracy
        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2))
        img_bytes = pix.tobytes("png")
        pil_img = Image.open(io.BytesIO(img_bytes))

        response = model.generate_content([_OCR_PROMPT, pil_img])
        page_texts.append(f"[Trang {page_num + 1}/{total}]\n{response.text}")
        logger.debug("  Page %d extracted (%d chars)", page_num + 1, len(response.text))

    doc.close()
    return "\n\n".join(page_texts)


# ─── Image ────────────────────────────────────────────────────────────────────

def _extract_image(file_path: str) -> str:
    model = _model()
    pil_img = Image.open(file_path)
    logger.info("Extracting text from image '%s'", file_path)
    response = model.generate_content([_OCR_PROMPT, pil_img])
    return response.text
