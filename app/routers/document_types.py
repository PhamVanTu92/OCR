from typing import List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.exceptions import ConflictError, NotFoundError
from app.dependencies import CurrentUser, get_current_user, require_roles
from app.models.document_type import (
    DocumentCategory,
    DocumentType,
    DocumentTypeField,
    DocumentTypeTable,
    DocumentTypeTableColumn,
)
from app.schemas.document_type import (
    DocumentCategoryCreate,
    DocumentCategoryResponse,
    DocumentCategoryUpdate,
    DocumentTypeCreate,
    DocumentTypeFieldCreate,
    DocumentTypeFieldResponse,
    DocumentTypeFieldUpdate,
    DocumentTypeResponse,
    DocumentTypeTableColumnCreate,
    DocumentTypeTableColumnResponse,
    DocumentTypeTableCreate,
    DocumentTypeTableResponse,
    DocumentTypeTableUpdate,
    DocumentTypeUpdate,
)

router = APIRouter(prefix="/document-types", tags=["Document Types"])


def _load_dt(db: Session, dt_id: int) -> DocumentType | None:
    """Query DocumentType cùng với fields/tables/columns trong 1 lần (eager load)."""
    return (
        db.query(DocumentType)
        .options(
            selectinload(DocumentType.fields),
            selectinload(DocumentType.tables).selectinload(DocumentTypeTable.columns),
        )
        .filter(DocumentType.id == dt_id)
        .first()
    )


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORIES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/categories", response_model=List[DocumentCategoryResponse], summary="Danh sách nhóm chứng từ")
async def list_categories(
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    return db.query(DocumentCategory).filter(DocumentCategory.is_active == True).all()


@router.post("/categories", response_model=DocumentCategoryResponse, status_code=201, summary="Tạo nhóm chứng từ")
async def create_category(
    data: DocumentCategoryCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    if db.query(DocumentCategory).filter(DocumentCategory.code == data.code).first():
        raise ConflictError(f"Mã nhóm '{data.code}' đã tồn tại")
    cat = DocumentCategory(**data.model_dump())
    db.add(cat)
    db.commit()
    db.refresh(cat)
    return cat


@router.put("/categories/{cat_id}", response_model=DocumentCategoryResponse, summary="Cập nhật nhóm chứng từ")
async def update_category(
    cat_id: int,
    data: DocumentCategoryUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    cat = db.query(DocumentCategory).filter(DocumentCategory.id == cat_id).first()
    if not cat:
        raise NotFoundError("Không tìm thấy nhóm chứng từ")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(cat, k, v)
    db.commit()
    db.refresh(cat)
    return cat


@router.delete("/categories/{cat_id}", status_code=204, summary="Xoá nhóm chứng từ")
async def delete_category(
    cat_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    cat = db.query(DocumentCategory).filter(DocumentCategory.id == cat_id).first()
    if not cat:
        raise NotFoundError("Không tìm thấy nhóm chứng từ")
    # Kiểm tra còn loại chứng từ thuộc nhóm này không
    used = db.query(DocumentType).filter(
        DocumentType.category_id == cat_id,
        DocumentType.is_active == True,
    ).count()
    if used:
        from fastapi import HTTPException
        raise HTTPException(
            status_code=400,
            detail=f"Nhóm này đang có {used} loại chứng từ đang hoạt động, không thể xoá.",
        )
    db.delete(cat)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENT TYPES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/", response_model=List[DocumentTypeResponse], summary="Danh sách loại chứng từ")
async def list_document_types(
    category_id: Optional[int] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    from sqlalchemy import or_
    q = (
        db.query(DocumentType)
        .options(
            selectinload(DocumentType.fields),
            selectinload(DocumentType.tables).selectinload(DocumentTypeTable.columns),
        )
        .filter(DocumentType.is_active == True)
    )
    if category_id:
        q = q.filter(DocumentType.category_id == category_id)
    if search:
        q = q.filter(or_(
            DocumentType.name.ilike(f"%{search}%"),
            DocumentType.code.ilike(f"%{search}%"),
        ))
    return q.all()


@router.post("/", response_model=DocumentTypeResponse, status_code=201, summary="Tạo loại chứng từ")
async def create_document_type(
    data: DocumentTypeCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    if db.query(DocumentType).filter(DocumentType.code == data.code).first():
        raise ConflictError(f"Mã loại chứng từ '{data.code}' đã tồn tại")
    if not db.query(DocumentCategory).filter(DocumentCategory.id == data.category_id).first():
        raise NotFoundError("Nhóm chứng từ không tồn tại")

    fields_data = data.fields
    tables_data = data.tables
    dt = DocumentType(**data.model_dump(exclude={"fields", "tables"}))
    db.add(dt)
    db.flush()  # get dt.id before inserting children

    for f in fields_data:
        db.add(DocumentTypeField(document_type_id=dt.id, **f.model_dump()))

    for t in tables_data:
        cols_data = t.columns
        tbl = DocumentTypeTable(document_type_id=dt.id, **t.model_dump(exclude={"columns"}))
        db.add(tbl)
        db.flush()
        for c in cols_data:
            db.add(DocumentTypeTableColumn(table_id=tbl.id, **c.model_dump()))

    db.commit()
    return _load_dt(db, dt.id)


@router.get("/{dt_id}", response_model=DocumentTypeResponse, summary="Chi tiết loại chứng từ")
async def get_document_type(
    dt_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(get_current_user),
):
    dt = _load_dt(db, dt_id)
    if not dt:
        raise NotFoundError("Không tìm thấy loại chứng từ")
    return dt


@router.put("/{dt_id}", response_model=DocumentTypeResponse, summary="Cập nhật loại chứng từ")
async def update_document_type(
    dt_id: int,
    data: DocumentTypeUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    dt = db.query(DocumentType).filter(DocumentType.id == dt_id).first()
    if not dt:
        raise NotFoundError("Không tìm thấy loại chứng từ")

    # ── 1. Cập nhật các scalar field ──────────────────────────────────────
    SCALAR = {"name", "description", "system_prompt",
              "allowed_formats", "allow_multiple", "is_active"}
    for k, v in data.model_dump(exclude_none=True,
                                 exclude={"fields", "tables"}).items():
        if k in SCALAR:
            setattr(dt, k, v)

    # ── 2. Full-replace fields ─────────────────────────────────────────────
    if data.fields is not None:
        # Xoá toàn bộ fields cũ trực tiếp qua SQL (tránh session-cache issues)
        db.query(DocumentTypeField).filter(
            DocumentTypeField.document_type_id == dt_id
        ).delete(synchronize_session="fetch")
        db.flush()

        for i, f in enumerate(data.fields):
            db.add(DocumentTypeField(
                document_type_id=dt_id,
                field_name=f.field_name,
                field_key=f.field_key,
                field_type=f.field_type,
                position=f.position,
                is_required=f.is_required,
                description=f.description,
                sort_order=i,
            ))

    # ── 3. Full-replace tables + columns ──────────────────────────────────
    if data.tables is not None:
        # Lấy ID các table hiện tại để xoá columns trước (tránh FK violation)
        existing_tbl_ids: List[int] = [
            r[0] for r in db.query(DocumentTypeTable.id)
            .filter(DocumentTypeTable.document_type_id == dt_id).all()
        ]
        if existing_tbl_ids:
            db.query(DocumentTypeTableColumn).filter(
                DocumentTypeTableColumn.table_id.in_(existing_tbl_ids)
            ).delete(synchronize_session="fetch")
        db.query(DocumentTypeTable).filter(
            DocumentTypeTable.document_type_id == dt_id
        ).delete(synchronize_session="fetch")
        db.flush()

        for i, t in enumerate(data.tables):
            new_tbl = DocumentTypeTable(
                document_type_id=dt_id,
                table_name=t.table_name,
                table_key=t.table_key,
                description=t.description,
                sort_order=i,
            )
            db.add(new_tbl)
            db.flush()  # lấy new_tbl.id trước khi insert columns

            for j, c in enumerate(t.columns):
                db.add(DocumentTypeTableColumn(
                    table_id=new_tbl.id,
                    column_name=c.column_name,
                    column_key=c.column_key,
                    column_type=c.column_type,
                    is_required=c.is_required,
                    sort_order=j,
                ))

    db.commit()
    # Re-query với eager load → tránh lazy-load sau khi session đã thay đổi
    return _load_dt(db, dt_id)


@router.delete("/{dt_id}", status_code=204, summary="Vô hiệu hoá loại chứng từ")
async def delete_document_type(
    dt_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    dt = db.query(DocumentType).filter(DocumentType.id == dt_id).first()
    if not dt:
        raise NotFoundError("Không tìm thấy loại chứng từ")
    dt.is_active = False
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# FIELDS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/{dt_id}/fields", response_model=DocumentTypeFieldResponse, status_code=201, summary="Thêm trường")
async def add_field(
    dt_id: int,
    data: DocumentTypeFieldCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    if not db.query(DocumentType).filter(DocumentType.id == dt_id).first():
        raise NotFoundError("Không tìm thấy loại chứng từ")
    f = DocumentTypeField(document_type_id=dt_id, **data.model_dump())
    db.add(f)
    db.commit()
    db.refresh(f)
    return f


@router.put("/{dt_id}/fields/{field_id}", response_model=DocumentTypeFieldResponse, summary="Sửa trường")
async def update_field(
    dt_id: int,
    field_id: int,
    data: DocumentTypeFieldUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    f = (
        db.query(DocumentTypeField)
        .filter(DocumentTypeField.id == field_id, DocumentTypeField.document_type_id == dt_id)
        .first()
    )
    if not f:
        raise NotFoundError("Không tìm thấy trường")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(f, k, v)
    db.commit()
    db.refresh(f)
    return f


@router.delete("/{dt_id}/fields/{field_id}", status_code=204, summary="Xoá trường")
async def delete_field(
    dt_id: int,
    field_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    f = (
        db.query(DocumentTypeField)
        .filter(DocumentTypeField.id == field_id, DocumentTypeField.document_type_id == dt_id)
        .first()
    )
    if not f:
        raise NotFoundError("Không tìm thấy trường")
    db.delete(f)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# TABLES
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/{dt_id}/tables", response_model=DocumentTypeTableResponse, status_code=201, summary="Thêm bảng")
async def add_table(
    dt_id: int,
    data: DocumentTypeTableCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    if not db.query(DocumentType).filter(DocumentType.id == dt_id).first():
        raise NotFoundError("Không tìm thấy loại chứng từ")
    cols_data = data.columns
    tbl = DocumentTypeTable(document_type_id=dt_id, **data.model_dump(exclude={"columns"}))
    db.add(tbl)
    db.flush()
    for c in cols_data:
        db.add(DocumentTypeTableColumn(table_id=tbl.id, **c.model_dump()))
    db.commit()
    db.refresh(tbl)
    return tbl


@router.put("/{dt_id}/tables/{table_id}", response_model=DocumentTypeTableResponse, summary="Sửa bảng")
async def update_table(
    dt_id: int,
    table_id: int,
    data: DocumentTypeTableUpdate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    tbl = (
        db.query(DocumentTypeTable)
        .filter(DocumentTypeTable.id == table_id, DocumentTypeTable.document_type_id == dt_id)
        .first()
    )
    if not tbl:
        raise NotFoundError("Không tìm thấy bảng")
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(tbl, k, v)
    db.commit()
    db.refresh(tbl)
    return tbl


@router.delete("/{dt_id}/tables/{table_id}", status_code=204, summary="Xoá bảng")
async def delete_table(
    dt_id: int,
    table_id: int,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    tbl = (
        db.query(DocumentTypeTable)
        .filter(DocumentTypeTable.id == table_id, DocumentTypeTable.document_type_id == dt_id)
        .first()
    )
    if not tbl:
        raise NotFoundError("Không tìm thấy bảng")
    db.delete(tbl)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════════════
# TABLE COLUMNS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/{dt_id}/tables/{table_id}/columns",
    response_model=DocumentTypeTableColumnResponse,
    status_code=201,
    summary="Thêm cột vào bảng",
)
async def add_column(
    dt_id: int,
    table_id: int,
    data: DocumentTypeTableColumnCreate,
    db: Session = Depends(get_db),
    _: CurrentUser = Depends(require_roles("admin", "doc_manager")),
):
    tbl = (
        db.query(DocumentTypeTable)
        .filter(DocumentTypeTable.id == table_id, DocumentTypeTable.document_type_id == dt_id)
        .first()
    )
    if not tbl:
        raise NotFoundError("Không tìm thấy bảng")
    col = DocumentTypeTableColumn(table_id=table_id, **data.model_dump())
    db.add(col)
    db.commit()
    db.refresh(col)
    return col
