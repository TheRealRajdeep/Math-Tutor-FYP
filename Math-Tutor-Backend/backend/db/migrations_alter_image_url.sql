-- Migration to support multiple images per problem submission
-- Changes image_url from TEXT to JSONB to store array of image paths

-- Add unique constraint to test_submissions if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'test_submissions_test_id_student_id_key'
    ) THEN
        ALTER TABLE test_submissions 
        ADD CONSTRAINT test_submissions_test_id_student_id_key 
        UNIQUE (test_id, student_id);
    END IF;
END $$;

-- Alter the image_url column to JSONB
ALTER TABLE problem_submissions 
ALTER COLUMN image_url TYPE JSONB USING 
  CASE 
    WHEN image_url IS NULL THEN '[]'::jsonb
    WHEN image_url = '' THEN '[]'::jsonb
    ELSE jsonb_build_array(image_url)
  END;

-- Set default to empty array
ALTER TABLE problem_submissions 
ALTER COLUMN image_url SET DEFAULT '[]'::jsonb;

