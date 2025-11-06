-- Migration: Add status column to mock_tests table
-- This migration adds the status column to track test completion status

-- Check if column exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'mock_tests' 
        AND column_name = 'status'
    ) THEN
        ALTER TABLE mock_tests 
        ADD COLUMN status TEXT NOT NULL DEFAULT 'not_started';
        
        -- Create index for better query performance
        CREATE INDEX IF NOT EXISTS idx_mock_tests_status ON mock_tests(status);
        
        RAISE NOTICE 'Added status column to mock_tests table';
    ELSE
        RAISE NOTICE 'status column already exists in mock_tests table';
    END IF;
END $$;

