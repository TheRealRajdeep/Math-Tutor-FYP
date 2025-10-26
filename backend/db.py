import psycopg2
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

def get_db_connection():
    try:
        conn = psycopg2.connect(
            host=os.getenv("DB_HOST", "localhost"),
            dbname=os.getenv("DB_NAME", "your_db_name"),
            user=os.getenv("DB_USER", "your_user"),
            password=os.getenv("DB_PASSWORD", "your_password"),
            port=os.getenv("DB_PORT", 5432)
        )
        return conn
    except psycopg2.Error as e:
        raise Exception(f"Database connection failed: {str(e)}")