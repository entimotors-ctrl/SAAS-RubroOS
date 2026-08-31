import { apiGet, apiPost } from './api';

export interface WhatsAppStatus {
  linked: boolean;
  pending: boolean;
  phoneNumber?: string;
  linkedUserName?: string;
  updatedAt?: string;
}

export const getWhatsAppStatus = () => apiGet<WhatsAppStatus>('/whatsapp-identity/status');

export const linkWhatsApp = (phone_number: string) => apiPost<{ status: string }>('/whatsapp-identity/link', { phone_number });

export const verifyWhatsApp = (code: string) => apiPost<{ status: string; phoneNumber: string }>('/whatsapp-identity/verify', { code });

export const unlinkWhatsApp = () => apiPost<{ status: string }>('/whatsapp-identity/unlink');
