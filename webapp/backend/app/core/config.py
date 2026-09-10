from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    postgres_user: str
    postgres_password: str
    postgres_host: str = "postgres"
    postgres_port: int = 5432
    postgres_db: str
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 45
    refresh_token_expire_days: int = 7
    db_enc_key: str
    metabase_site_url: str
    metabase_embed_secret: str
    metabase_dashboard_id: int = 2
    cors_origins: str = "http://localhost:8082"
    # Docker-internal service name (see docker-compose.yml's "n8n" service) - n8n owns the
    # Request/Approve/Reject/Return business logic (and its own Telegram notifications) via
    # webhook-triggered workflows; FastAPI only proxies to these, it never runs that SQL or
    # sends its own Telegram messages. See the design notes for the workflow spec.
    n8n_webhook_base: str = "http://n8n:5678/webhook"
    n8n_webhook_shared_secret: str
    frontend_base_url: str = "http://localhost:8082"


settings = Settings()

