-- Migration: Add student_id column to mock_tests table
-- This migration adds the student_id column to track which user generated each test

-- Check if column exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'mock_tests' 
        AND column_name = 'student_id'
    ) THEN
        ALTER TABLE mock_tests 
        ADD COLUMN student_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
        
        -- Create index for better query performance
        CREATE INDEX IF NOT EXISTS idx_mock_tests_student_id ON mock_tests(student_id);
        
        RAISE NOTICE 'Added student_id column to mock_tests table';
    ELSE
        RAISE NOTICE 'student_id column already exists in mock_tests table';
    END IF;
END $$;

