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
