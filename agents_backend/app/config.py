from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # to get a string like this run:
    # openssl rand -hex 32
    SECRET_KEY: str = "secret"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30000

    # Google OAuth config
    GOOGLE_CLIENT_ID: str = "for_authentication"

    GOOGLE_CLOUD_PROJECT: str = "for_authentication"
    IS_PRODUCTION: bool = False


settings = Settings()  # type: ignore
