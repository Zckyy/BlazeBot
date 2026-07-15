import { XaiApiError } from '../xai/client.js';
import { AiBudgetExceededError, AiChatDisabledError, DuplicateAiMessageError } from './chat.js';
import { ConversationQueueFullError } from './queue.js';

export function aiErrorMessage(error: unknown): string {
  if (error instanceof AiChatDisabledError) {
    return 'Grok chat is not enabled yet. An administrator needs to configure the xAI API key.';
  }
  if (error instanceof AiBudgetExceededError) return error.message;
  if (error instanceof ConversationQueueFullError) return error.message;
  if (error instanceof DuplicateAiMessageError) return 'That message has already been processed.';
  if (error instanceof XaiApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'BlazeBot could not authenticate with xAI. Please tell an administrator.';
    }
    if (error.status === 429) return 'Grok is being rate-limited. Please try again shortly.';
    if (error.status !== undefined && error.status >= 500) {
      return 'xAI is temporarily unavailable. Please try again shortly.';
    }
    if (error.status !== undefined) {
      return 'xAI rejected the request. Please try a different message or tell an administrator.';
    }
    return error.message;
  }
  return 'Something went wrong while talking to Grok. Please try again.';
}
