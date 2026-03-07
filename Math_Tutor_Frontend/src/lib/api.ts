import { API_BASE_URL } from './constants';

// Types for API responses
export interface Problem {
  problem_id: number;
  domain: string[];
  problem: string;
  solution: string;
  answer: string;
  difficulty_level: number;
  source?: string;
  created_at?: string;
}

export interface MockTest {
  test_id: number;
  test_type: string;
  difficulty_range: string;
  total_questions: number;
  domain_distribution: Record<string, number>;
  problems: Problem[];
  status?: 'not_started' | 'in_progress' | 'completed';
  grade?: {
    total_problems: number;
    correct_answers: number;
    average_percentage: number;
    total_percentage: number;
  };
}

export interface Submission {
  submission_id: number;
  test_id: number;
  student_id: string;
  submitted_at: string;
  status: 'pending' | 'processing' | 'graded';
}

export interface GradingResult {
  problem_id: number;
  answer_is_correct: boolean;
  answer_confidence: number;
  logical_flow_score: number;
  percentage: number;
  first_error_step_index?: number;
  error_summary?: string;
  hint_provided?: string;
  final_score?: number;
}

export interface User {
  id: number;
  name: string;
  email: string;
  school?: string | null;
  date_of_birth?: string | null;
  grade?: string | null;
  is_active: boolean;
}

export interface Token {
  access_token: string;
  token_type: string;
}

export interface DomainStat {
  name: string;
  total_attempted: number;
  correct: number;
  accuracy: number;
  avg_score: number;
  avg_logic_score: number;
  strength_level: 'weak' | 'developing' | 'strong';
  trend: 'improving' | 'declining' | 'stable';
}

export interface TestHistoryEntry {
  test_id: number;
  label: string;
  test_type: string;
  avg_score: number;
  correct: number;
  total: number;
  date: string | null;
}

// ── Teaching types ────────────────────────────────────────────────────────────

export type LessonStepType = 'intro' | 'example' | 'practice' | 'checkpoint' | 'summary';
export type LessonStepStatus = 'pending' | 'completed' | 'skipped';
export type StepResult = 'passed' | 'failed' | 'skipped' | 'continued';

export interface LessonStep {
  step_index: number;
  type: LessonStepType;
  title: string;
  content: string;
  question: string | null;
  expected_answer: string | null;
  status: LessonStepStatus;
}

export interface StepOverview {
  step_index: number;
  type: LessonStepType;
  title: string;
  status: LessonStepStatus;
}

export interface TeachingSession {
  session_id: number;
  topic: string;
  domain: string;
  total_steps: number;
  current_step: LessonStep | null;
  current_step_index: number;
  completed: boolean;
  retry_count: number;
  steps_overview: StepOverview[];
}

export interface StepEvaluation {
  is_correct: boolean;
  feedback: string;
  hint: string | null;
}

export interface AdvanceResponse {
  evaluation: StepEvaluation | null;
  reexplanation: string | null;
  step_result: StepResult;
  next_step: LessonStep | null;
  current_step_index: number;
  session_complete: boolean;
}

export interface TeachingSessionSummary {
  session_id: number;
  topic: string;
  domain: string;
  current_step: number;
  completed: boolean;
  created_at: string | null;
  completed_at: string | null;
  total_steps: number;
}

export interface RecommendedResource {
  recommendation_id: number;
  material_id: number;
  title: string;
  url: string;
  type: 'video' | 'article' | 'practice' | 'cheat_sheet' | string;
  description: string;
  is_completed: boolean;
  icon: string;
  source: 'db' | 'curated';
}

export interface DomainRecommendation {
  domain: string;
  avg_score: number;
  strength_level: 'weak' | 'developing' | 'strong';
  error_themes: string[];
  resources: RecommendedResource[];
  study_tip: string | null;
}

export interface RecommendationsResponse {
  weak_domains: DomainRecommendation[];
  all_completed: boolean;
}

export interface PracticeSessionState {
  problems_attempted: number;
  problems_correct: number;
  target: number;
  current_difficulty: number;
  status: 'active' | 'completed';
  session_problems?: Array<{
    problem_id: number;
    score: number;
    is_correct: boolean;
    difficulty: number;
  }>;
}

export interface PracticeSession {
  session_id: number;
  mock_test_id: number;
  domain: string;
  current_problem: Problem | null;
  session_state: PracticeSessionState;
}

export interface PracticeGradeResult {
  score: {
    percentage: number;
    is_correct: boolean;
    logical_flow_score: number;
    error_summary: string | null;
    answer_reasoning: string | null;
  };
  decision: 'harder' | 'same' | 'easier';
  feedback_message: string;
  next_difficulty: number;
  session_complete: boolean;
  problems_attempted: number;
  problems_correct: number;
  next_problem: Problem | null;
}

export interface PracticeSessionSummary {
  session_id: number;
  domain: string;
  problems_attempted: number;
  problems_correct: number;
  current_difficulty: number;
  status: 'active' | 'completed';
  started_at: string | null;
  completed_at: string | null;
  accuracy: number;
}

export interface AnalyticsProfile {
  domains: DomainStat[];
  overall: {
    total_attempted: number;
    total_correct: number;
    accuracy: number;
    avg_score: number;
    tests_completed: number;
  };
  strongest_domain: string | null;
  weakest_domain: string | null;
  recent_error_themes: string[];
  test_history: TestHistoryEntry[];
}

export interface SignupData {
  name: string;
  email: string;
  password: string;
  school?: string;
  date_of_birth?: string;
  grade?: string;
}

// API client with error handling
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  token?: string | null
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers as Record<string, string>,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    if (response.status === 401) {
      window.dispatchEvent(new Event('auth:unauthorized'));
    }
    const errorText = await response.text();
    let errorMessage = `API error: ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.detail || errorMessage;
    } catch {
      errorMessage = errorText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  return response.json();
}

// API functions
export const api = {
  // Mock Tests
  generateMockTest: async (token?: string | null): Promise<MockTest> => {
    return apiRequest<MockTest>('/api/entry_mock_test', {}, token);
  },

  generateTargetedTest: async (token?: string | null): Promise<MockTest> => {
    return apiRequest<MockTest>('/api/mock_tests/targeted', { method: 'POST' }, token);
  },

  getMockTests: async (token?: string | null): Promise<MockTest[]> => {
    return apiRequest<MockTest[]>('/api/mock_tests', {}, token);
  },

  submitTest: async (testId: number, token?: string | null): Promise<{ test_id: number; submission_id: number; status: string; message: string }> => {
    return apiRequest(`/api/mock_tests/${testId}/submit`, {
      method: 'POST',
    }, token);
  },

  getTestResults: async (testId: number, token?: string | null): Promise<GradingResult[]> => {
    return apiRequest<GradingResult[]>(`/api/mock_tests/${testId}/results`, {}, token);
  },

  // Problems
  getProblems: async (limit: number = 10, offset: number = 0): Promise<Problem[]> => {
    return apiRequest<Problem[]>(`/api/problems?limit=${limit}&offset=${offset}`);
  },

  getProblemsByDomain: async (domain: string, limit: number = 10): Promise<Problem[]> => {
    return apiRequest<Problem[]>(`/api/problems/domain?domain=${domain}&limit=${limit}`);
  },

  getProblemById: async (problemId: number): Promise<Problem> => {
    return apiRequest<Problem>(`/api/problems/${problemId}`);
  },

  // Submissions
  submitSolution: async (
    testId: number,
    problemId: number,
    studentId: string,
    imageFiles: File[]
  ): Promise<{ submission_id: number; message: string }> => {
    const formData = new FormData();
    formData.append('test_id', testId.toString());
    formData.append('problem_id', problemId.toString());
    formData.append('student_id', studentId);

    imageFiles.forEach((file) => {
      formData.append('image_files', file);
    });

    const response = await fetch(`${API_BASE_URL}/api/submit_solution`, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }

    return response.json();
  },

  gradeSubmission: async (submissionId: number, problemId?: number): Promise<{ submission_id: number; message: string }> => {
    let url = `/api/grade_submission/${submissionId}`;
    if (problemId) {
      url += `?problem_id=${problemId}`;
    }
    return apiRequest(url, {
      method: 'POST',
    });
  },

  getSubmissionResults: async (submissionId: number): Promise<GradingResult[]> => {
    return apiRequest<GradingResult[]>(`/api/submission/${submissionId}/results`);
  },

  // Tutor (RAG)
  generateHint: async (query: string): Promise<string> => {
    const response = await fetch(`${API_BASE_URL}/api/rag/hint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });
    
    if (!response.ok) {
      throw new Error(`API error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return typeof data === 'string' ? data : data.hint || data.message || 'Hint generated';
  },

  // Auth
  login: async (email: string, password: string): Promise<Token> => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await fetch(`${API_BASE_URL}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `API error: ${response.statusText}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.detail || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      throw new Error(errorMessage);
    }

    return response.json();
  },

  signup: async (data: SignupData): Promise<User> => {
    return apiRequest<User>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getCurrentUser: async (token: string): Promise<User> => {
    return apiRequest<User>('/auth/me', {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  },

  // Curriculum
  selectCurriculum: async (durationMonths: number, token?: string | null): Promise<any> => {
    return apiRequest('/api/curriculum/select', {
      method: 'POST',
      body: JSON.stringify({ duration_months: durationMonths }),
    }, token);
  },

  getMyCurriculumSelection: async (token?: string | null): Promise<any> => {
    return apiRequest('/api/curriculum/my-selection', {}, token);
  },

  getDailyTasks: async (taskDate?: string, token?: string | null): Promise<any> => {
    const url = taskDate 
      ? `/api/curriculum/daily-tasks?task_date=${taskDate}`
      : '/api/curriculum/daily-tasks';
    return apiRequest(url, {}, token);
  },

  completeTask: async (taskId: number, token?: string | null): Promise<any> => {
    return apiRequest(`/api/curriculum/daily-tasks/${taskId}/complete`, {
      method: 'POST',
    }, token);
  },

  getTaskHistory: async (limit: number = 30, token?: string | null): Promise<any> => {
    return apiRequest(`/api/curriculum/daily-tasks/history?limit=${limit}`, {}, token);
  },

  // Teaching
  getTopicSuggestions: async (): Promise<Record<string, string[]>> => {
    return apiRequest<Record<string, string[]>>('/api/teach/topics');
  },

  startTeachingSession: async (
    topic: string,
    domain: string,
    token?: string | null,
  ): Promise<TeachingSession> => {
    return apiRequest<TeachingSession>('/api/teach/session/start', {
      method: 'POST',
      body: JSON.stringify({ topic, domain }),
    }, token);
  },

  getTeachingSession: async (sessionId: number, token?: string | null): Promise<TeachingSession> => {
    return apiRequest<TeachingSession>(`/api/teach/session/${sessionId}`, {}, token);
  },

  advanceTeachingSession: async (
    sessionId: number,
    studentResponse: string,
    token?: string | null,
  ): Promise<AdvanceResponse> => {
    return apiRequest<AdvanceResponse>(`/api/teach/session/${sessionId}/advance`, {
      method: 'POST',
      body: JSON.stringify({ student_response: studentResponse }),
    }, token);
  },

  getTeachingSessions: async (limit = 8, token?: string | null): Promise<TeachingSessionSummary[]> => {
    return apiRequest<TeachingSessionSummary[]>(`/api/teach/sessions?limit=${limit}`, {}, token);
  },

  // Recommendations
  getRecommendations: async (maxDomains = 3, token?: string | null): Promise<RecommendationsResponse> => {
    return apiRequest<RecommendationsResponse>(
      `/api/recommendations?max_domains=${maxDomains}`,
      {},
      token,
    );
  },

  completeRecommendation: async (recommendationId: number, token?: string | null): Promise<{ recommendation_id: number; is_completed: boolean }> => {
    return apiRequest(
      `/api/recommendations/${recommendationId}/complete`,
      { method: 'POST' },
      token,
    );
  },

  // Practice Sessions
  startPracticeSession: async (domain: string, token?: string | null): Promise<PracticeSession> => {
    return apiRequest<PracticeSession>('/api/practice/session/start', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }, token);
  },

  getPracticeSession: async (sessionId: number, token?: string | null): Promise<PracticeSession> => {
    return apiRequest<PracticeSession>(`/api/practice/session/${sessionId}`, {}, token);
  },

  gradePracticeSession: async (
    sessionId: number,
    submissionId: number,
    token?: string | null
  ): Promise<PracticeGradeResult> => {
    return apiRequest<PracticeGradeResult>(`/api/practice/session/${sessionId}/grade`, {
      method: 'POST',
      body: JSON.stringify({ submission_id: submissionId }),
    }, token);
  },

  getMySessions: async (limit: number = 5, token?: string | null): Promise<PracticeSessionSummary[]> => {
    return apiRequest<PracticeSessionSummary[]>(`/api/practice/sessions?limit=${limit}`, {}, token);
  },

  // Analytics
  getAnalyticsProfile: async (token?: string | null): Promise<AnalyticsProfile> => {
    return apiRequest<AnalyticsProfile>('/api/analytics/my-profile', {}, token);
  },
};
