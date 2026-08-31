import { apiGet, apiPost } from './api';

export interface ChatResponse {
  type: 'message' | 'confirmation_required';
  conversationId: number;
  message: string;
  actionId?: number;
}

export interface ConversationSummary {
  id: number;
  channel: string;
  created_at: string;
  updated_at: string;
}

export interface StoredMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export const sendChatMessage = (conversationId: number | undefined, message: string) =>
  apiPost<ChatResponse>('/ai/chat', { conversationId, message });

export const confirmAction = (actionId: number) => apiPost<ChatResponse>('/ai/confirm', { actionId });

export const cancelAction = (actionId: number) => apiPost<ChatResponse>('/ai/cancel', { actionId });

export const listConversations = () => apiGet<ConversationSummary[]>('/ai/conversations');

export const getConversationMessages = (conversationId: number) => apiGet<StoredMessage[]>(`/ai/conversations/${conversationId}/messages`);
