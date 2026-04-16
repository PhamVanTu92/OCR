from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class UserResponse(BaseModel):
    id: int
    keycloak_id: str
    email: str
    full_name: Optional[str]
    username: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserOrganizationResponse(BaseModel):
    user_id: int
    organization_id: int
    role: str
    is_primary: bool

    model_config = {"from_attributes": True}
