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


def reset_sequences():
    """Reset sequences for grading_results and mock_tests tables to start from 1"""
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL not set in environment")
    
    conn = psycopg2.connect(database_url)
    try:
        with conn:
            with conn.cursor() as cur:
                # Reset grading_results result_id sequence
                cur.execute("ALTER SEQUENCE grading_results_result_id_seq RESTART WITH 1;")
                print("Reset grading_results_result_id_seq to start from 1")
                
                # Reset mock_tests test_id sequence
                cur.execute("ALTER SEQUENCE mock_tests_test_id_seq RESTART WITH 1;")
                print("Reset mock_tests_test_id_seq to start from 1")
                
                conn.commit()
        print("All sequences reset successfully")
    except Exception as e:
        print(f"Error resetting sequences: {e}")
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    import sys
    if len(sys.argv) > 1 and sys.argv[1] == "reset":
        reset_sequences()
    elif len(sys.argv) > 1 and sys.argv[1] == "alter":
        run_alter_migration()
    else:
        run_migration()


