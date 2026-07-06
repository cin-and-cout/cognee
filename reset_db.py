import app.env_init  # noqa: F401
import asyncio

import cognee


async def reset_database():
    """
    Wipes local Cognee SQLite database, Graph DB, and Vector store files.
    """
    import os
    cognee_api_key = os.getenv("COGNEE_API_KEY")
    if cognee_api_key:
        print("=" * 80)
        print("⚠️  WARNING: COGNEE_API_KEY detected.")
        print("You are connected to Cognee Cloud. Local pruning operations will prune local data,")
        print("but may not clear remote graph data stored in Cognee Cloud.")
        print("To clear cloud data, manage it directly on the Cognee Cloud dashboard.")
        print("=" * 80)
        
    print("Resetting local Cognee databases and raw data files...")
    # Removes raw data files (local disk or S3)
    await cognee.prune.prune_data()

    # Removes graph data, vector data, relational metadata, and caches
    await cognee.prune.prune_system(metadata=True)
    print("Local Cognee reset completed successfully.")


if __name__ == "__main__":
    asyncio.run(reset_database())
