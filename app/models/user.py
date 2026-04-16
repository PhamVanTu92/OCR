from sqlalchemy import Column, Integer, Boolean, ForeignKey
from sqlalchemy import Unicode
from sqlalchemy.orm import relationship
from .base import Base, TimestampMixin


class User(Base, TimestampMixin):
    """
    Local mirror of a Keycloak user.
    Auto-provisioned on first successful JWT authentication.
    """

    __tablename__ = "users"

    id           = Column(Integer, primary_key=True, index=True)
    keycloak_id  = Column(Unicode(100), unique=True, nullable=False, index=True)
    email        = Column(Unicode(255), unique=True, nullable=False, index=True)
    full_name    = Column(Unicode(255), nullable=True)
    username     = Column(Unicode(100), unique=True, nullable=False)
    is_active    = Column(Boolean, default=True)

    user_organizations  = relationship("UserOrganization", back_populates="user")
    documents           = relationship("Document", back_populates="user",
                                       foreign_keys="Document.user_id")
    confirmed_documents = relationship("Document", back_populates="confirmed_by",
                                       foreign_keys="Document.confirmed_by_user_id")
    user_roles          = relationship("UserRole", back_populates="user", cascade="all, delete-orphan")
    api_tokens          = relationship("APIToken", back_populates="user", cascade="all, delete-orphan")


class UserOrganization(Base, TimestampMixin):
    """Maps a user to one or more organisations with an optional role."""

    __tablename__ = "user_organizations"

    id              = Column(Integer, primary_key=True, index=True)
    user_id         = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    organization_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    role            = Column(Unicode(50), default="member")   # manager | member | viewer
    is_primary      = Column(Boolean, default=False)

    user         = relationship("User", back_populates="user_organizations")
    organization = relationship("Organization", back_populates="user_organizations")
