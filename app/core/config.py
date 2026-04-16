from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import field_validator
from functools import lru_cache
from urllib.parse import quote_plus
from typing import List


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
    )

    # ─── Database ───────────────────────────────────────────────────────────
    DB_HOST: str = "localhost"
    DB_PORT: int = 1433
    DB_NAME: str = "ocr_db"
    DB_USER: str = "sa"
    DB_PASSWORD: str = "Password123!"

    @property
    def DATABASE_URL(self) -> str:
        pwd = quote_plus(self.DB_PASSWORD)
        return (
            f"mssql+pyodbc://{self.DB_USER}:{pwd}@"
            f"{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"
            "?driver=ODBC+Driver+17+for+SQL+Server"
        )

    # ─── Keycloak ───────────────────────────────────────────────────────────
    KEYCLOAK_URL: str = "https://keycloak.foxai.com.vn"
    KEYCLOAK_REALM: str = "OCR"
    KEYCLOAK_CLIENT_ID: str = "ocr"
    KEYCLOAK_CLIENT_SECRET: str = "DhtHQMhhLLI3e5Pt5zs9JsYzDg2SuyR6"
    KEYCLOAK_ADMIN_USERNAME: str = "admin"
    KEYCLOAK_ADMIN_PASSWORD: str = "Admmin@1234"

    # ─── Gemini ─────────────────────────────────────────────────────────────
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.5-flash"

    # ─── File Storage ───────────────────────────────────────────────────────
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10 MB

    # ─── Application ────────────────────────────────────────────────────────
    DEBUG: bool = False
    SECRET_KEY: str = "change-me"
    ALLOWED_ORIGINS: List[str] = ["*"]


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
