"""
CartGuard AI - Configuration Settings
"""
import os
try:
    from pydantic_settings import BaseSettings
except ImportError:
    from pydantic import BaseModel as BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # App
    APP_NAME: str = "CartGuard AI"
    APP_VERSION: str = "2.0.0"
    DEBUG: bool = True

    # API Keys
    OPENAI_API_KEY: Optional[str] = os.getenv("OPENAI_API_KEY", "")
    GROQ_API_KEY: Optional[str] = os.getenv("GROQ_API_KEY", "")
    SENDGRID_API_KEY: Optional[str] = os.getenv("SENDGRID_API_KEY", "")
    TWILIO_ACCOUNT_SID: Optional[str] = os.getenv("TWILIO_ACCOUNT_SID", "")
    TWILIO_AUTH_TOKEN: Optional[str] = os.getenv("TWILIO_AUTH_TOKEN", "")
    TWILIO_FROM_NUMBER: Optional[str] = os.getenv("TWILIO_FROM_NUMBER", "")

    # Database (MongoDB only)
    MONGO_URI: str = os.getenv("DATABASE_URL", os.getenv("MONGO_URI", "mongodb://localhost:27017"))
    MONGO_DB_NAME: str = os.getenv("MONGO_DB_NAME", "cartguard")
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # ML Model Settings
    CATBOOST_MODEL_PATH: str = "models/catboost_model.cbm"
    XGBOOST_MODEL_PATH: str = "models/xgboost_model.json"
    FEATURE_PIPELINE_PATH: str = "models/feature_pipeline.pkl"

    # LLM Settings
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "openai")
    OPENAI_MODEL: str = "gpt-4o-mini"
    GROQ_MODEL: str = "llama-3.1-8b-instant"
    LOCAL_LLM_URL: str = os.getenv("LOCAL_LLM_URL", "http://localhost:11434")

    # Agent Settings
    AGENT_TIMEOUT_MS: int = 300
    LLM_TIMEOUT_MS: int = 200
    MAX_RETRIES: int = 3

    # Business Rules
    PER_USER_BUDGET_INR: float = 500.0
    PER_CAMPAIGN_BUDGET_INR: float = 50000.0
    MIN_RISK_SCORE_FOR_ACTION: float = 0.55
    MAX_DISCOUNT_PERCENT: float = 20.0
    HIGH_VALUE_CART_THRESHOLD: float = 2000.0

    # Risk Thresholds
    HIGH_RISK_THRESHOLD: float = 0.75
    MEDIUM_RISK_THRESHOLD: float = 0.55
    LOW_RISK_THRESHOLD: float = 0.35

    # Cost per model call (INR)
    COST_CATBOOST_PER_CALL: float = 0.001
    COST_LLM_SMALL_PER_CALL: float = 0.05
    COST_LLM_LARGE_PER_CALL: float = 0.50

    # CORS
    CORS_ORIGINS: list = ["http://localhost:3000", "http://localhost:5173", "*"]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()