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
  
  // Add auth token if provided
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `API error: ${response.statusText}`;
    try {
      const errorJson = JSON.parse(errorText);
      errorMessage = errorJson.detail || errorMessage;
    } catch {
      // If not JSON, use the text as is
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

  gradeSubmission: async (submissionId: number): Promise<{ submission_id: number; message: string }> => {
    return apiRequest(`/api/grade_submission/${submissionId}`, {
      method: 'POST',
    });
  },

  getSubmissionResults: async (submissionId: number): Promise<GradingResult[]> => {
    return apiRequest<GradingResult[]>(`/api/submission/${submissionId}/results`);
  },

  // Tutor (RAG)
  generateHint: async (query: string): Promise<string> => {
    // This would use the RAG endpoint - adjust based on actual endpoint
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
    // OAuth2PasswordRequestForm expects form-encoded data
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
};

