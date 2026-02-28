import { 
  LayoutDashboard, 
  FileText, 
  BookOpen, 
  Upload, 
  TrendingUp, 
  MessageCircle, 
  GraduationCap
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/mock-tests', label: 'Mock Tests', icon: FileText },
  { href: '/problems', label: 'Problem Practice', icon: BookOpen },
  { href: '/submissions', label: 'Submissions', icon: Upload },
  { href: '/progress', label: 'Progress & Analytics', icon: TrendingUp },
  { href: '/tutor', label: 'AI Tutor', icon: MessageCircle },
  { href: '/curriculum', label: 'Curriculum', icon: GraduationCap },
];

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
