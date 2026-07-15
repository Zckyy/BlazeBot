import { OpenRouterApiError } from '../openrouter/client.js';
import {
  AiBudgetExceededError,
  AiChatDisabledError,
  AiWebSearchDisabledError,
  DuplicateAiMessageError,
} from './chat.js';
import { ConversationQueueFullError } from './queue.js';

export function aiErrorMessage(error: unknown): string {
  if (error instanceof AiChatDisabledError) {
    return 'AI chat is not enabled yet. An administrator needs to configure OpenRouter.';
  }
  if (error instanceof AiWebSearchDisabledError) return error.message;
  if (error instanceof AiBudgetExceededError) return error.message;
  if (error instanceof ConversationQueueFullError) return error.message;
  if (error instanceof DuplicateAiMessageError) return 'That message has already been processed.';
  if (error instanceof OpenRouterApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'BlazeBot could not authenticate with OpenRouter. Please tell an administrator.';
    }
    if (error.status === 429) return 'The AI is being rate-limited. Please try again shortly.';
    if (error.status !== undefined && error.status >= 500) {
      return 'OpenRouter is temporarily unavailable. Please try again shortly.';
    }
    if (error.status !== undefined) {
      return 'OpenRouter rejected the request. Try a different message or tell an administrator.';
    }
    return error.message;
  }
  return 'Something went wrong while talking to the AI. Please try again.';
}
