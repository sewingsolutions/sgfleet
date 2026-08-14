import secrets
import string

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    admin_api_key: str = ""
    encryption_key: str = ""
    db_path: str = "/data/admin.db"
    default_rate_limit: float = 2.0
    default_max_concurrent: int = 2
    default_request_cost: float = 0.001
    model_config = {"env_prefix": "", "env_parse_none_str": "None", "protected_namespaces": ()}


settings = Settings()


def generate_key() -> str:
    chars = string.ascii_letters + string.digits + "!@#$%^&*"
    random_part = "".join(secrets.choice(chars) for _ in range(40))
    return f"sk-{random_part}"


def mask_key(key: str) -> str:
    if key.startswith("sk-"):
        return "sk-***"
    return "***"
