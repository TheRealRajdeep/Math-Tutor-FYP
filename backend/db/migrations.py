import os
import psycopg2

from dotenv import load_dotenv


def run_migration():
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL not set in environment")

    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    with open(schema_path, "r", encoding="utf-8") as f:
        sql = f.read()

    conn = psycopg2.connect(database_url)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql)
    finally:
        conn.close()


def run_alter_migration():
    """Run migration to alter image_url column to JSONB for multiple images support"""
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL not set in environment")

    migration_path = os.path.join(os.path.dirname(__file__), "migrations_alter_image_url.sql")
    with open(migration_path, "r", encoding="utf-8") as f:
        sql = f.read()

    conn = psycopg2.connect(database_url)
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql)
        print("Migration completed: image_url column altered to JSONB")
    except Exception as e:
        print(f"Migration error (may already be applied): {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "alter":
        run_alter_migration()
    else:
        run_migration()


