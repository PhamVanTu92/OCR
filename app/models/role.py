"""
Role & Permission system.

Tables:
  permissions    – system-defined atomic permission codes
  system_roles   – named roles (system built-in + user-created)
  role_permissions – many-to-many role ↔ permission
  user_roles     – global role assignment per user (not org-scoped)
"""

from sqlalchemy import Column, Integer, Boolean, ForeignKey, Unicode, UnicodeText, UniqueConstraint
from sqlalchemy.orm import relationship
from .base import Base, TimestampMixin


class Permission(Base):
    __tablename__ = "permissions"
    id          = Column(Integer, primary_key=True, index=True)
    code        = Column(Unicode(100), unique=True, nullable=False)   # e.g. "ocr.upload"
    name        = Column(Unicode(200), nullable=False)                # display name
    category    = Column(Unicode(100), nullable=False)                # grouping label
    description = Column(UnicodeText, nullable=True)
    role_permissions = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")


class SystemRole(Base, TimestampMixin):
    __tablename__ = "system_roles"
    id           = Column(Integer, primary_key=True, index=True)
    name         = Column(Unicode(100), unique=True, nullable=False)  # slug, e.g. "doc_manager"
    display_name = Column(Unicode(200), nullable=False)
    description  = Column(UnicodeText, nullable=True)
    is_system    = Column(Boolean, default=False)                     # True = cannot delete
    color        = Column(Unicode(30),  default="indigo")             # tailwind color key
    role_permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan")
    user_roles       = relationship("UserRole", back_populates="role", cascade="all, delete-orphan")


class RolePermission(Base):
    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("role_id", "permission_id"),)
    id            = Column(Integer, primary_key=True, index=True)
    role_id       = Column(Integer, ForeignKey("system_roles.id", ondelete="CASCADE"), nullable=False)
    permission_id = Column(Integer, ForeignKey("permissions.id",  ondelete="CASCADE"), nullable=False)
    role       = relationship("SystemRole", back_populates="role_permissions")
    permission = relationship("Permission",  back_populates="role_permissions")


class UserRole(Base, TimestampMixin):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id"),)
    id      = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role_id = Column(Integer, ForeignKey("system_roles.id", ondelete="CASCADE"), nullable=False)
    role = relationship("SystemRole", back_populates="user_roles")
    user = relationship("User", back_populates="user_roles")
