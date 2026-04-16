from sqlalchemy import Column, Integer, Boolean, ForeignKey
from sqlalchemy import Unicode, UnicodeText
from sqlalchemy.orm import relationship
from .base import Base, TimestampMixin


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"

    id           = Column(Integer, primary_key=True, index=True)
    parent_id    = Column(Integer, ForeignKey("organizations.id"), nullable=True)
    name         = Column(Unicode(255), nullable=False)
    code         = Column(Unicode(50),  unique=True, nullable=False, index=True)
    group_name   = Column(Unicode(100), nullable=True)   # Nhóm: Ban Lãnh đạo, Kỹ thuật…
    manager_name = Column(Unicode(255), nullable=True)   # Người phụ trách
    level        = Column(Integer, default=0)
    path         = Column(Unicode(2000), nullable=True)
    description  = Column(UnicodeText,  nullable=True)
    is_active    = Column(Boolean, default=True)

    parent             = relationship("Organization", remote_side=[id], back_populates="children")
    children           = relationship("Organization", back_populates="parent")
    user_organizations = relationship("UserOrganization", back_populates="organization")
    documents          = relationship("Document", back_populates="organization")
