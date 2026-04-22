"""
Structured data extraction using Gemini.

Given:
  - raw_text   : text already extracted by ocr_service
  - document_type : DocumentType ORM object (with .fields and .tables loaded)

Returns:
  (extracted_data: dict, processing_time_ms: int)

  extracted_data shape:
  {
    "fields": { "invoice_number": "...", "date": "...", ... },
    "tables": {
      "line_items": [
        {"item_name": "...", "quantity": 2, "unit_price": 100.0},
        ...
      ]
    }
  }
"""

import json
import re
import time
import logging

import google.generativeai as genai

from app.core.config import settings
from app.models.document_type import DocumentType

logger = logging.getLogger(__name__)


# ─── Schema builder ──────────────────────────────────────────────────────────

def build_extraction_schema(document_type: DocumentType) -> dict:
    """
    Translate a DocumentType's fields / tables into a plain dict
    that describes the expected JSON output to the LLM.
    """
    schema: dict = {"fields": {}, "tables": {}}

    for f in document_type.fields:
        schema["fields"][f.field_key] = {
            "type": f.field_type,
            "label": f.field_name,
            "required": f.is_required,
        }

    for tbl in document_type.tables:
        schema["tables"][tbl.table_key] = {
            "label": tbl.table_name,
            "columns": {
                col.column_key: {
                    "type": col.column_type,
                    "label": col.column_name,
                    "required": col.is_required,
                }
                for col in tbl.columns
            },
        }

    return schema


def _build_example_output(schema: dict) -> dict:
    """Produce a skeleton example that shows the LLM the exact JSON shape."""
    return {
        "fields": {
            key: f"<{val['type']}>" for key, val in schema["fields"].items()
        },
        "tables": {
            key: [
                {col: f"<{cval['type']}>" for col, cval in val["columns"].items()}
            ]
            for key, val in schema["tables"].items()
        },
    }


# ─── Main extraction function ─────────────────────────────────────────────────

async def extract_structured_data(
    raw_text: str,
    document_type: DocumentType,
) -> tuple[dict, int]:
    """
    Call Gemini to extract structured JSON from *raw_text* using the
    schema defined in *document_type*.

    Returns (data_dict, elapsed_ms).
    """
    schema = build_extraction_schema(document_type)
    example_output = _build_example_output(schema)

    # Use the user-defined system prompt if present; fall back to a generic one.
    system_directive = document_type.system_prompt or (
        f"Bạn là chuyên gia trích xuất dữ liệu từ chứng từ '{document_type.name}'. "
        "Hãy trích xuất đúng và đầy đủ các trường theo yêu cầu."
    )

    prompt = f"""{system_directive}

Loại chứng từ: {document_type.name}

Schema cần trích xuất (dạng mô tả):
{json.dumps(schema, ensure_ascii=False, indent=2)}

Định dạng JSON đầu ra mong muốn:
{json.dumps(example_output, ensure_ascii=False, indent=2)}

Nội dung văn bản cần xử lý:
---
{raw_text}
---

Yêu cầu:
- Trả về DUY NHẤT một JSON object có hai khóa "fields" và "tables".
- Không thêm giải thích, không dùng markdown code block.
- Nếu một trường không tìm thấy trong văn bản, đặt giá trị là null.
- Tất cả số tiền, số lượng phải là kiểu number (không có dấu phân cách nghìn).
"""

    key = settings.GEMINI_API_KEY
    logger.info("Gemini key prefix: %s...", key[:12] if key else "(empty)")
    genai.configure(api_key=key)
    model = genai.GenerativeModel(settings.GEMINI_MODEL)

    start = time.time()
    response = model.generate_content(
        prompt,
        generation_config={"response_mime_type": "application/json", "temperature": 0},
    )
    elapsed_ms = int((time.time() - start) * 1000)

    raw_response = response.text.strip()
    logger.debug("LLM extraction took %d ms, response length %d", elapsed_ms, len(raw_response))

    return _parse_json_response(raw_response), elapsed_ms


# ─── JSON parsing helpers ────────────────────────────────────────────────────

def _parse_json_response(text: str) -> dict:
    """
    Parse the LLM response to a dict.
    Falls back to regex extraction if the model wrapped output in markdown.
    """
    # 1. Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2. Strip markdown code fences and retry
    stripped = re.sub(r"^```[a-z]*\n?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        pass

    # 3. Find first {...} block
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Cannot parse LLM response as JSON. Response preview: {text[:300]}")
