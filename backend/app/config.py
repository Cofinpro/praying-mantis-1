from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL


class Settings(BaseSettings):
    """Reads settings from environment variables, falling back to backend/.env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    db_user: str
    db_password: str
    db_host: str = "127.0.0.1"
    db_port: int = 3306
    db_name: str

    # Comma-separated in .env, e.g. "http://localhost:5173,https://cofinpro.github.io"
    cors_origins: str = "http://localhost:5173,https://cofinpro.github.io"

    # Signs the JWTs. Required, no default: a leaked default would let anyone forge tokens.
    # HS256 needs at least 32 bytes.
    jwt_secret: str = Field(min_length=32)
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 8 * 60

    @property
    def database_url(self) -> URL:
        return self.url_for(self.db_name)

    def url_for(self, database: str | None) -> URL:
        """The DB URL for another database on the same server (None = no database selected)."""
        # URL.create escapes special characters in the password
        return URL.create(
            "mysql+pymysql",
            username=self.db_user,
            password=self.db_password,
            host=self.db_host,
            port=self.db_port,
            database=database,
        )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
