import json
import re
import psycopg2
import pandas as pd
from sentence_transformers import SentenceTransformer
import numpy as np
from typing import List, Dict, Any
import logging
from datasets import load_dataset
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class OmniMathIngester:
    def __init__(self, db_config: Dict[str, str]):
        """
        Initialize the ingester with database configuration
        
        Args:
            db_config: Dictionary containing database connection parameters
        """
        self.db_config = db_config
        self.model = SentenceTransformer(os.getenv('EMBEDDING_MODEL', 'all-MiniLM-L6-v2'))
        
    def clean_domain(self, domain) -> str:
        """
        Clean the domain column by removing square brackets, inverted commas, 
        and replacing arrows with commas
        
        Args:
            domain: Raw domain (can be list, string, or None)
            
        Returns:
            Cleaned domain string
        """
        if not domain:
            return ""
        
        # Convert to string if it's a list
        if isinstance(domain, list):
            domain = ', '.join(str(item) for item in domain)
        else:
            domain = str(domain)
            
        # Remove square brackets
        domain = re.sub(r'[\[\]]', '', domain)
        
        # Remove inverted commas (both single and double quotes)
        domain = re.sub(r'["\']', '', domain)
        
        # Replace arrows with commas
        domain = re.sub(r'->', ',', domain)
        domain = re.sub(r'→', ',', domain)  # Unicode arrow
        
        # Clean up multiple commas and whitespace
        domain = re.sub(r',\s*,', ',', domain)  # Remove multiple commas
        domain = re.sub(r'\s+', ' ', domain)   # Normalize whitespace
        domain = domain.strip(', ')             # Remove leading/trailing commas and spaces
        
        return domain
    
    def generate_embedding(self, text: str) -> List[float]:
        """
        Generate vector embedding for the given text
        
        Args:
            text: Text to embed
            
        Returns:
            List of float values representing the embedding
        """
        if not text:
            return [0.0] * 384  # Return zero vector for empty text
            
        try:
            embedding = self.model.encode(text)
            return embedding.tolist()
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            return [0.0] * 384
    
    def load_dataset_from_huggingface(self) -> List[Dict[str, Any]]:
        """
        Load the Omni-MATH dataset from Hugging Face
        
        Returns:
            List of dictionaries containing the data
        """
        try:
            logger.info("Loading Omni-MATH dataset from Hugging Face...")
            dataset = load_dataset("KbsdJames/Omni-MATH")
            
            # Get the test split (as shown in the dataset viewer)
            data = dataset['test']
            
            # Convert to list of dictionaries
            data_list = []
            for i in range(len(data)):
                record = {
                    'domain': data[i]['domain'],
                    'difficulty_level': str(data[i]['difficulty']),  # Convert float to string
                    'problem': data[i]['problem'],
                    'solution': data[i]['solution'],
                    'answer': data[i]['answer'],
                    'topic': data[i].get('source', ''),  # Map source to topic
                }
                data_list.append(record)
            
            logger.info(f"Loaded {len(data_list)} records from Omni-MATH dataset")
            return data_list
            
        except Exception as e:
            logger.error(f"Error loading dataset from Hugging Face: {e}")
            raise
    
    def preprocess_data(self, data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Preprocess the dataset with domain cleaning and embedding generation
        
        Args:
            data: Raw dataset
            
        Returns:
            Preprocessed dataset
        """
        processed_data = []
        
        for i, record in enumerate(data):
            try:
                # Clean the domain column
                record['domain'] = self.clean_domain(record['domain'])
                
                # Generate embedding from problem text (combine problem + solution for better embeddings)
                problem_text = ""
                if record.get('problem'):
                    problem_text += str(record['problem']) + " "
                if record.get('solution'):
                    problem_text += str(record['solution']) + " "
                if record.get('answer'):
                    problem_text += str(record['answer'])
                
                # Generate embedding
                record['embedding'] = self.generate_embedding(problem_text.strip())
                
                processed_data.append(record)
                
                if (i + 1) % 100 == 0:
                    logger.info(f"Processed {i + 1} records...")
                    
            except Exception as e:
                logger.error(f"Error processing record {i}: {e}")
                continue
        
        logger.info(f"Successfully processed {len(processed_data)} records")
        return processed_data
    
    def create_connection(self):
        """Create database connection"""
        try:
            conn = psycopg2.connect(**self.db_config)
            return conn
        except Exception as e:
            logger.error(f"Error connecting to database: {e}")
            raise
    
    def insert_data(self, data: List[Dict[str, Any]], batch_size: int = 100):
        """
        Insert preprocessed data into PostgreSQL
        
        Args:
            data: Preprocessed dataset
            batch_size: Number of records to insert per batch
        """
        conn = self.create_connection()
        cur = conn.cursor()
        
        try:
            # Prepare the insert query - Updated to match your table schema
            columns = ['domain', 'difficulty_level', 'problem', 'solution', 'answer', 'topic', 'embedding']
            placeholders = ', '.join(['%s'] * len(columns))
            query = f"""
                INSERT INTO omni_math_data ({', '.join(columns)})
                VALUES ({placeholders})
            """
            
            # Insert data in batches
            for i in range(0, len(data), batch_size):
                batch = data[i:i + batch_size]
                batch_data = []
                
                for record in batch:
                    row = []
                    for col in columns:
                        if col == 'embedding':
                            row.append(record.get(col, [0.0] * 384))
                        elif col == 'difficulty_level':
                            row.append(str(record.get(col, '')))  # Ensure it's a string
                        else:
                            row.append(record.get(col, ''))
                    batch_data.append(tuple(row))
                
                cur.executemany(query, batch_data)
                conn.commit()
                
                logger.info(f"Inserted batch {i//batch_size + 1}: records {i+1} to {min(i+batch_size, len(data))}")
            
            logger.info(f"Successfully inserted {len(data)} records into database")
            
        except Exception as e:
            logger.error(f"Error inserting data: {e}")
            conn.rollback()
            raise
        finally:
            cur.close()
            conn.close()
    
    def ingest_dataset(self, batch_size: int = None):
        """
        Complete ingestion pipeline for Omni-MATH dataset
        
        Args:
            batch_size: Batch size for database insertion (uses env var if not provided)
        """
        if batch_size is None:
            batch_size = int(os.getenv('BATCH_SIZE', 100))
            
        logger.info("Starting Omni-MATH dataset ingestion...")
        
        # Load dataset from Hugging Face
        data = self.load_dataset_from_huggingface()
        
        # Preprocess data
        processed_data = self.preprocess_data(data)
        
        # Insert into database
        self.insert_data(processed_data, batch_size)
        
        logger.info("Omni-MATH dataset ingestion completed successfully!")

def get_db_config():
    """Get database configuration from environment variables"""
    return {
        'host': os.getenv('DB_HOST', 'localhost'),
        'database': os.getenv('DB_NAME', 'math_tutor_db'),
        'user': os.getenv('DB_USER'),
        'password': os.getenv('DB_PASSWORD'),
        'port': int(os.getenv('DB_PORT', 5432))
    }

# Usage example
if __name__ == "__main__":
    # Get database configuration from environment variables
    db_config = get_db_config()
    
    # Validate required environment variables
    if not db_config['user'] or not db_config['password']:
        logger.error("DB_USER and DB_PASSWORD must be set in environment variables")
        exit(1)
    
    # Initialize ingester
    ingester = OmniMathIngester(db_config)
    
    # Ingest the dataset
    ingester.ingest_dataset()