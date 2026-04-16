"""
API Tokens – long-lived credentials for external systems to call our API,
or referenced by integration configs as outgoing Bearer tokens.

Token format:  oct_<uuid4_hex>   (40 chars total)
Stored as plain text – accessible to admin for display/rotation.
"""

from sqlalchemy import Column, Integer, Boolean, ForeignKey, Unicode, UnicodeText, JSON
from sqlalchemy.orm import relationship
from .base import Base, TimestampMixin


class APIToken(Base, TimestampMixin):
    __tablename__ = "api_tokens"

    id           = Column(Integer,      primary_key=True, index=True)
    name         = Column(Unicode(200), nullable=False)          # friendly label
    token        = Column(Unicode(50),  unique=True, nullable=False, index=True)
    token_prefix = Column(Unicode(12),  nullable=False)          # first 12 chars for display
    user_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_active    = Column(Boolean,  default=True)
    expires_at   = Column(Unicode(50), nullable=True)            # ISO string, null = never
    scopes       = Column(JSON, nullable=True)                   # list[str] e.g. ["ocr.view","integration.export"]
    last_used_at = Column(Unicode(50), nullable=True)

    user = relationship("User", back_populates="api_tokens")
