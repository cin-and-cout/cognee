import asyncio

import cognee


async def reset_database():
    """
    Wipes local Cognee SQLite database, Graph DB, and Vector store files.
    """
    print("Resetting Cognee databases and raw data files...")
    # Removes raw data files (local disk or S3)
    await cognee.prune.prune_data()

    # Removes graph data, vector data, relational metadata, and caches
    await cognee.prune.prune_system(metadata=True)
    print("Cognee reset completed successfully.")


if __name__ == "__main__":
    asyncio.run(reset_database())
