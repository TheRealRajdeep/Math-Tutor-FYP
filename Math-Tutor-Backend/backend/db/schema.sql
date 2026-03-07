-- Neon/PostgreSQL schema for mock test auto-grading system
-- Requires pgvector extension

CREATE EXTENSION IF NOT EXISTS vector;

-- Table: mock_tests
CREATE TABLE IF NOT EXISTS mock_tests (
  test_id SERIAL PRIMARY KEY,
  test_type TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  problems JSONB NOT NULL,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE
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


-- ---------------------------------------------------------
-- New Schema Updates for Batches, Curriculum, and Logging
-- ---------------------------------------------------------

-- Table: batches
CREATE TABLE IF NOT EXISTS batches (
  batch_id SERIAL PRIMARY KEY,
  batch_name TEXT NOT NULL,
  duration_months INTEGER NOT NULL,
  start_date DATE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: curriculum_plans
CREATE TABLE IF NOT EXISTS curriculum_plans (
  plan_id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES batches(batch_id) ON DELETE CASCADE,
  week_number INTEGER NOT NULL,
  topic TEXT NOT NULL,
  description TEXT,
  resources JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Update users table to include batch_id
ALTER TABLE users ADD COLUMN IF NOT EXISTS batch_id INTEGER REFERENCES batches(batch_id);

-- Update mock_tests table with configuration columns
ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS domains JSONB DEFAULT '[]'::jsonb;
ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS difficulty NUMERIC;
ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS question_count INTEGER;
ALTER TABLE mock_tests ADD COLUMN IF NOT EXISTS duration_minutes INTEGER;

-- Table: study_materials
CREATE TABLE IF NOT EXISTS study_materials (
  material_id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  material_type TEXT NOT NULL,
  url TEXT,
  content TEXT,
  related_topics JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: student_recommendations
CREATE TABLE IF NOT EXISTS student_recommendations (
  recommendation_id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  material_id INTEGER REFERENCES study_materials(material_id) ON DELETE CASCADE,
  reason TEXT,
  is_completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Table: practice_problem_attempts
CREATE TABLE IF NOT EXISTS practice_problem_attempts (
  attempt_id SERIAL PRIMARY KEY,
  student_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  problem_id INTEGER NOT NULL,
  student_answer TEXT,
  is_correct BOOLEAN,
  time_taken_seconds INTEGER,
  attempted_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------
-- Curriculum Feature Tables
-- ---------------------------------------------------------

-- Table: user_curriculum_selections
CREATE TABLE IF NOT EXISTS user_curriculum_selections (
  selection_id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  duration_months INTEGER NOT NULL CHECK (duration_months IN (1, 3, 6, 12)),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  selected_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(student_id)
);

-- Table: teaching_sessions
-- Each row is one structured lesson session (5-6 GPT-generated steps).
-- lesson_plan stores the full step array as JSONB; current_step is the 0-based index.
CREATE TABLE IF NOT EXISTS teaching_sessions (
  session_id    SERIAL PRIMARY KEY,
  student_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  topic         TEXT NOT NULL,
  domain        TEXT NOT NULL,
  lesson_plan   JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_step  INTEGER NOT NULL DEFAULT 0,
  retry_count   INTEGER NOT NULL DEFAULT 0,
  completed     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

-- Table: practice_sessions
-- Tracks adaptive practice sessions per student per domain.
-- current_difficulty is adjusted after each problem (up on >=80%, down on <50%).
CREATE TABLE IF NOT EXISTS practice_sessions (
  session_id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mock_test_id INTEGER REFERENCES mock_tests(test_id),
  domain TEXT NOT NULL,
  current_difficulty FLOAT NOT NULL DEFAULT 3.0,
  problems_attempted INTEGER NOT NULL DEFAULT 0,
  problems_correct INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  session_problems JSONB NOT NULL DEFAULT '[]'::jsonb,
  current_problem_id INTEGER,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Table: daily_tasks
CREATE TABLE IF NOT EXISTS daily_tasks (
  task_id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_date DATE NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('practice_problem', 'study_material', 'topic_review')),
  task_content JSONB NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  curriculum_duration_months INTEGER NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(student_id, task_date, task_type, task_content)
);
