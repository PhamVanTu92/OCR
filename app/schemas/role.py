from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class PermissionResponse(BaseModel):
    id:          int
    code:        str
    name:        str
    category:    str
    description: Optional[str]
    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    name:         str
    display_name: str
    description:  Optional[str] = None
    color:        str = "indigo"
    permission_ids: List[int] = []


class RoleUpdate(BaseModel):
    display_name:   Optional[str] = None
    description:    Optional[str] = None
    color:          Optional[str] = None
    permission_ids: Optional[List[int]] = None


class RoleResponse(BaseModel):
    id:           int
    name:         str
    display_name: str
    description:  Optional[str]
    is_system:    bool
    color:        str
    permissions:  List[PermissionResponse] = []
    created_at:   datetime
    model_config = {"from_attributes": True}


class UserRoleAssign(BaseModel):
    role_id: int


class UserRoleResponse(BaseModel):
    role_id:      int
    role_name:    str
    display_name: str
    color:        str
