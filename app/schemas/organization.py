from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


class OrganizationCreate(BaseModel):
    name: str
    code: str
    parent_id: Optional[int] = None
    group_name: Optional[str] = None
    manager_name: Optional[str] = None
    description: Optional[str] = None


class OrganizationUpdate(BaseModel):
    name: Optional[str] = None
    group_name: Optional[str] = None
    manager_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class OrganizationResponse(BaseModel):
    id: int
    parent_id: Optional[int]
    name: str
    code: str
    group_name: Optional[str]
    manager_name: Optional[str]
    level: int
    path: Optional[str]
    description: Optional[str]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class OrganizationTree(OrganizationResponse):
    children: List["OrganizationTree"] = []


OrganizationTree.model_rebuild()


class AssignUserRequest(BaseModel):
    user_id: int
    role: str = "member"
    is_primary: bool = False
