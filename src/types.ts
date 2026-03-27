export type UserRole = 'zzp' | 'admin';

export interface UserProfile {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
}

export interface Client {
  id: string;
  name: string;
  address?: string;
  contactPerson?: string;
  email: string;
}

export interface Assignment {
  id: string;
  clientId: string;
  zzpId: string;
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  hourlyRate?: number;
}

export type RegistrationStatus = 'draft' | 'submitted' | 'approved' | 'rejected';

export interface TimeRegistration {
  id: string;
  assignmentId: string;
  zzpId: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  description?: string;
  status: RegistrationStatus;
  totalHours: number;
  submittedAt?: string;
  approvedAt?: string;
  rejectionReason?: string;
}
