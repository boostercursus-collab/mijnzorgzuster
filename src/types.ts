export type UserRole = 'zzp' | 'admin';

export interface UserProfile {
  uid: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role: UserRole;
  displayName?: string; // Optioneel: handig voor weergave in lijsten
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
  uid: string; // AANGEPAST: was zzpId
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
  uid: string; // AANGEPAST: was zzpId
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
  createdAt?: string; // Handig voor sortering
  updatedAt?: string;
}
