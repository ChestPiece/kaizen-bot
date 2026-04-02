const GENERIC_TOOL_ERROR =
  "I hit a temporary issue while processing that request. Please try again.";

export function toLogError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export function toToolErrorMessage(message?: string): string {
  if (!message) return GENERIC_TOOL_ERROR;

  const lowered = message.toLowerCase();
  if (
    lowered.includes("not found") ||
    lowered.includes("not assigned") ||
    lowered.includes("invalid") ||
    lowered.includes("duplicate")
  ) {
    return message;
  }

  return GENERIC_TOOL_ERROR;
}

export function toApiErrorMessage(): string {
  return "Internal server error";
}
