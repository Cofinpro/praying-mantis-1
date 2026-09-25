import tempfile
from functools import cached_property

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
    # The database server's CA certificate as PEM text (from the host's dashboard).
    # PyMySQL already encrypts whenever the server offers TLS, but without a CA it
    # doesn't check *who* it's talking to. With it, the server's certificate and host
    # name are verified. Set it for any remote database; leave it unset locally.
    db_ssl_ca: str | None = None

    # Comma-separated in .env, e.g. "http://localhost:5173,https://cofinpro.github.io"
    cors_origins: str = "http://localhost:5173,https://cofinpro.github.io"

    # Email (BE-4.2). No SMTP_HOST = emails are switched off (e.g. on Render).
    # Locally, docker-compose's Mailpit listens on localhost:1025.
    smtp_host: str | None = None
    smtp_port: int = 1025
    smtp_from: str = "PreyingMantis <noreply@preyingmantis.test>"
    # The frontend's base URL, for links in emails
    app_url: str = "http://localhost:5173"

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

    @cached_property
    def db_connect_args(self) -> dict:
        """Extra PyMySQL connect() arguments: TLS when DB_SSL_CA is set."""
        if not self.db_ssl_ca:
            return {}
        # PyMySQL wants a file path, and hosts give us the PEM as a secret string
        ca_file = tempfile.NamedTemporaryFile("w", suffix=".pem", delete=False)
        ca_file.write(self.db_ssl_ca.replace("\\n", "\n"))
        ca_file.close()
        return {"ssl": {"ca": ca_file.name}}

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
