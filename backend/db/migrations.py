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


def reset_sequences(truncate_tables=False):
    """
    Reset all sequences (submission_id, result_id, test_id, id) to start from 1.
    
    Args:
        truncate_tables: If True, truncate tables (deletes all data and resets sequences).
                        If False, only reset sequences without deleting data.
    """
    load_dotenv()
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL not set in environment")
    
    conn = psycopg2.connect(database_url)
    try:
        with conn:
            with conn.cursor() as cur:
                if truncate_tables:
                    # Truncate tables (deletes all data and automatically resets sequences)
                    tables = [
                        ("student_mistakes", "student_mistakes id"),
                        ("grading_results", "result_id"),
                        ("problem_submissions", "problem_submissions (FK only)"),
                        ("test_submissions", "submission_id"),
                        ("mock_tests", "test_id"),
                    ]
                    
                    print("Truncating tables (this will delete all data and reset sequences)...")
                    for table_name, description in tables:
                        try:
                            # Use CASCADE to handle foreign key constraints
                            cur.execute(f"TRUNCATE TABLE {table_name} CASCADE;")
                            print(f"Truncated {table_name} ({description})")
                        except Exception as table_error:
                            print(f"Warning: Could not truncate {table_name}: {table_error}")
                            continue
                    
                    print("All tables truncated and sequences reset successfully")
                else:
                    # Only reset sequences without deleting data
                    sequences = [
                        ("test_submissions_submission_id_seq", "submission_id"),
                        ("grading_results_result_id_seq", "result_id"),
                        ("mock_tests_test_id_seq", "test_id"),
                        ("student_mistakes_id_seq", "student_mistakes id"),
                    ]
                    
                    for seq_name, description in sequences:
                        try:
                            cur.execute(f"ALTER SEQUENCE {seq_name} RESTART WITH 1;")
                            print(f"Reset {description} sequence ({seq_name}) to start from 1")
                        except Exception as seq_error:
                            print(f"Warning: Could not reset {seq_name}: {seq_error}")
                            # Continue with other sequences even if one fails
                            continue
                    
                    print("All sequences reset successfully")
                
                conn.commit()
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


