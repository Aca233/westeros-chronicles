export type ModelRequestTraceStatus = 'blocked' | 'resolving' | 'settling' | 'narrating' | 'complete' | 'failed';

export interface TracedChatMessage {
  role: string;
  content: string;
  chars: number;
}

export interface TracedMessageBundle {
  messages: TracedChatMessage[];
  chars: number;
}

export interface ModelRequestTrace {
  turnNumber: number;
  capturedAt: number;
  status: ModelRequestTraceStatus;
  offline: boolean;
  provider: string;
  model: string;
  actionText?: string;
  blockedReason?: string;
  error?: string;
  contextError?: string;
  worldContext: {
    automatic: string;
    committed: string;
    resolutionPrompt: string;
    narrationPrompt: string;
  };
  resolution: TracedMessageBundle;
  narration: TracedMessageBundle;
}

export interface BuildModelRequestTraceInput {
  turnNumber: number;
  capturedAt?: number;
  status?: ModelRequestTraceStatus;
  offline: boolean;
  provider: string;
  model: string;
  actionText?: string;
  blockedReason?: string;
  error?: string;
  contextError?: string;
  worldContext?: Partial<ModelRequestTrace['worldContext']>;
  resolutionMessages?: ReadonlyArray<{ role: string; content: string }>;
  narrationMessages?: ReadonlyArray<{ role: string; content: string }>;
}

function traceMessages(messages: ReadonlyArray<{ role: string; content: string }>): TracedMessageBundle {
  const traced = messages.map((message) => ({
    role: message.role,
    content: message.content,
    chars: message.content.length,
  }));
  return {
    messages: traced,
    chars: traced.reduce((total, message) => total + message.chars, 0),
  };
}

const EMPTY_WORLD_CONTEXT = {
  automatic: '',
  committed: '',
  resolutionPrompt: '',
  narrationPrompt: '',
};

export function buildModelRequestTrace(input: BuildModelRequestTraceInput): ModelRequestTrace {
  return {
    turnNumber: input.turnNumber,
    capturedAt: input.capturedAt ?? Date.now(),
    status: input.status ?? (input.narrationMessages?.length ? 'complete' : 'resolving'),
    offline: input.offline,
    provider: input.provider,
    model: input.model,
    ...(input.actionText ? { actionText: input.actionText } : {}),
    ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
    ...(input.error ? { error: input.error } : {}),
    ...(input.contextError ? { contextError: input.contextError } : {}),
    worldContext: {
      ...EMPTY_WORLD_CONTEXT,
      ...input.worldContext,
    },
    resolution: traceMessages(input.resolutionMessages ?? []),
    narration: traceMessages(input.narrationMessages ?? []),
  };
}

export function modelRequestTraceContainsSecret(trace: ModelRequestTrace, secret: string): boolean {
  if (!secret) return false;
  const haystacks = [
    trace.provider,
    trace.model,
    trace.contextError ?? '',
    trace.actionText ?? '',
    trace.blockedReason ?? '',
    trace.error ?? '',
    trace.worldContext.automatic,
    trace.worldContext.committed,
    trace.worldContext.resolutionPrompt,
    trace.worldContext.narrationPrompt,
    ...trace.resolution.messages.flatMap((message) => [message.role, message.content]),
    ...trace.narration.messages.flatMap((message) => [message.role, message.content]),
  ];
  return haystacks.some((value) => value.includes(secret));
}
