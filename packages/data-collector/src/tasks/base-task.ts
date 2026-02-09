import type { TaskType, TaskResult } from "@sales-ai/core";
import type { LlmClient } from "@sales-ai/ai-engine";

export interface TaskContext {
  companyName: string;
  companyUrl?: string;
  industry?: string;
  llm: LlmClient;
}

export interface CollectionTask {
  type: TaskType;
  execute(ctx: TaskContext): Promise<TaskResult>;
}
