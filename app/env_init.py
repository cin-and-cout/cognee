import os
from dotenv import load_dotenv

# Load .env
load_dotenv()

# Resolve SYSTEM_ROOT_DIRECTORY and DATA_ROOT_DIRECTORY relative to the project root
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

for env_var in ["SYSTEM_ROOT_DIRECTORY", "DATA_ROOT_DIRECTORY"]:
    val = os.getenv(env_var)
    if val:
        val = val.strip('"').strip("'")
        if not os.path.isabs(val):
            abs_path = os.path.abspath(os.path.join(project_root, val))
            os.environ[env_var] = abs_path

from app.services.key_pool import LLMKeyPool

def _parse_keys(env_var: str, fallback_var: str = None) -> list:
    raw = os.getenv(env_var, "")
    if not raw and fallback_var:
        raw = os.getenv(fallback_var, "")
    return [k.strip() for k in raw.split(",") if k.strip()]

_keys = (
    _parse_keys("GEMINI_API_KEYS", "LLM_API_KEY")
    + _parse_keys("OPENAI_API_KEYS")
    + _parse_keys("GROQ_API_KEYS")
)
llm_key_pool = LLMKeyPool(_keys, cooldown_duration=int(os.getenv("KEY_COOLDOWN_SECONDS", "60")))

