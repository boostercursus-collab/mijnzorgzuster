// ==================== Rollen ====================
export type UserRole = 'zzp' | 'admin';

// Helper: check of een gebruiker admin is
export const isAdmin = (role?: UserRole | null): boolean => {
  return role === 'admin';
};

// Helper: check of een gebruiker ZZP'er is
export const isZzp = (role?: UserRole | null): boolean => {
  return role === 'zzp';
};

// ==================== Gebruikers ====================
export interface UserProfile {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  displayName?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Helper: volledige naam van een gebruiker
export const getUserFullName = (profile: UserProfile): string => {
  return profile.displayName || `${profile.firstName} ${profile.lastName}`;
};

// ==================== Clients ====================
export interface Client {
  id: string;
  name: string;
  address?: string;
  contactPerson?: string;
  email: string;
  phone?: string;
  marginPercentage?: number;  // Marge % specifiek voor deze opdrachtgever (bijv. 5, 10, 15)
  createdAt?: string;
  updatedAt?: string;
}

// ==================== Opdrachten ====================
export interface Assignment {
  id: string;
  clientId: string;
  uid: string;
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  hourlyRate?: number;
  rate?: number;         // Alias voor hourlyRate
  status?: 'active' | 'completed' | 'cancelled';
  createdAt?: string;
  updatedAt?: string;
}

// Helper: check of een opdracht actief is
export const isActiveAssignment = (assignment: Assignment): boolean => {
  const today = new Date().toISOString().split('T')[0];
  const isActive = assignment.status === 'active' && 
                   assignment.startDate <= today &&
                   (!assignment.endDate || assignment.endDate >= today);
  return isActive || false;
};

// ==================== Urenregistraties ====================
export type RegistrationStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface TimeRegistration {
  id: string;
  assignmentId: string;
  uid: string;
  date: string;
  startTime?: string;
  endTime?: string;
  breakMinutes?: number;
  description?: string;
  status: RegistrationStatus;
  duration?: number;
  totalHours: number;
  submittedAt?: string;
  approvedAt?: string;
  rejectionReason?: string;
  createdAt?: string;
  updatedAt?: string;
}

// Helper: bereken totale uren (als fallback)
export const calculateTotalHours = (
  startTime?: string, 
  endTime?: string, 
  breakMinutes: number = 0
): number => {
  if (!startTime || !endTime) return 0;
  
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  
  const startTotal = startHour * 60 + startMin;
  const endTotal = endHour * 60 + endMin;
  const totalMinutes = endTotal - startTotal - breakMinutes;
  
  return parseFloat((totalMinutes / 60).toFixed(2));
};

// Helper: check of een registratie bewerkbaar is
export const isEditable = (registration: TimeRegistration): boolean => {
  return registration.status === 'draft' || registration.status === 'rejected';
};

// Helper: check of een registratie goedgekeurd is
export const isApproved = (registration: TimeRegistration): boolean => {
  return registration.status === 'approved';
};

// Helper: haal uren op (duration of totalHours)
export const getRegistrationHours = (registration: TimeRegistration): number => {
  return registration.duration ?? registration.totalHours ?? 0;
};

// ==================== Auth Context Type ====================
export interface AuthContextType {
  user: import('firebase/auth').User | null;
  profile: UserProfile | null;
  role: UserRole | null;
  loading: boolean;
  isAuthReady: boolean;
}

// ==================== Dashboard statistieken ====================
export interface DashboardStats {
  totalHoursThisMonth: number;
  totalHoursThisWeek: number;
  pendingRegistrations: number;
  approvedRegistrations: number;
  rejectedRegistrations: number;
  activeAssignments: number;
}

// ==================== Filter types ====================
export interface TimeRegistrationFilter {
  startDate?: string;
  endDate?: string;
  status?: RegistrationStatus | 'all';
  uid?: string;
  assignmentId?: string;
}
