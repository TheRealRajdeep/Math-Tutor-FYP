-- Neon/PostgreSQL schema for mock test auto-grading system
-- Requires pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;

-- Table: mock_tests
CREATE TABLE IF NOT EXISTS mock_tests (
  test_id SERIAL PRIMARY KEY,
  test_type TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  problems JSONB NOT NULL
);

-- Table: test_submissions
CREATE TABLE IF NOT EXISTS test_submissions (
  submission_id SERIAL PRIMARY KEY,
  test_id INTEGER NOT NULL REFERENCES mock_tests(test_id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending',
  UNIQUE(test_id, student_id)
);

-- Table: problem_submissions
CREATE TABLE IF NOT EXISTS problem_submissions (
  submission_id INTEGER NOT NULL REFERENCES test_submissions(submission_id) ON DELETE CASCADE,
  problem_id INTEGER NOT NULL,
  image_url JSONB DEFAULT '[]'::jsonb,
  ocr_text TEXT,
  latex_output TEXT,
  student_answer TEXT,
  student_solution TEXT,
  ocr_processed_at TIMESTAMP,
  PRIMARY KEY (submission_id, problem_id)
);

-- Table: grading_results
CREATE TABLE IF NOT EXISTS grading_results (
  result_id SERIAL PRIMARY KEY,
  submission_id INTEGER NOT NULL REFERENCES test_submissions(submission_id) ON DELETE CASCADE,
  problem_id INTEGER NOT NULL,
  answer_correctness NUMERIC,
  answer_is_correct BOOLEAN,
  logical_flow_score NUMERIC,
  first_error_step_index INTEGER,
  error_summary TEXT,
  hint_provided TEXT,
  final_score NUMERIC,
  percentage NUMERIC,
  grading_breakdown JSONB,
  graded_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: student_mistakes (agentic memory)
CREATE TABLE IF NOT EXISTS student_mistakes (
  id SERIAL PRIMARY KEY,
  student_id TEXT NOT NULL,
  problem_id INTEGER NOT NULL,
  domain TEXT,
  step_index INTEGER,
  mistake_summary TEXT,
  embedding VECTOR(384),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);


