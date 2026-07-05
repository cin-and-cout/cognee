import os
import logging
from dotenv import load_dotenv

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(name)s: %(message)s'
)

logger = logging.getLogger(__name__)

# Load .env
load_dotenv()

# Resolve SYSTEM_ROOT_DIRECTORY and DATA_ROOT_DIRECTORY relative to the project root
project_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
logger.info(".env loaded", extra={"project_root": project_root})

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

gemini_keys = _parse_keys("GEMINI_API_KEYS", "LLM_API_KEY")
openai_keys = _parse_keys("OPENAI_API_KEYS")
groq_keys = _parse_keys("GROQ_API_KEYS")

logger.info("Keys parsed per provider", extra={"gemini_keys_count": len(gemini_keys), "openai_keys_count": len(openai_keys), "groq_keys_count": len(groq_keys)})

_keys = gemini_keys + openai_keys + groq_keys
logger.info("Total keys in pool", extra={"total_keys": len(_keys)})

if not _keys:
    logger.warning("Zero keys detected", extra={"msg": "Startup will fail on first LLM call"})

cooldown = int(os.getenv("KEY_COOLDOWN_SECONDS", "60"))
llm_key_pool = LLMKeyPool(_keys, cooldown_duration=cooldown)
logger.info("Key pool created", extra={"cooldown_duration": cooldown})

# Overwrite raw comma-separated variables in the system environment with the first key
# so third-party packages (like Cognee) that don't support multi-keys don't fail connection tests.
if gemini_keys:
    os.environ["GEMINI_API_KEY"] = gemini_keys[0]
if _keys:
    os.environ["LLM_API_KEY"] = _keys[0]

embedding_keys = _parse_keys("EMBEDDING_API_KEY")
if embedding_keys:
    os.environ["EMBEDDING_API_KEY"] = embedding_keys[0]

