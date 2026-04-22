import type { CoordTaskPriority, CoordTaskStatus } from "@/lib/coord/types";

export interface TaskDraft {
  status: CoordTaskStatus;
  owner: string;
  priority: CoordTaskPriority;
  description: string;
}

export interface CreateTaskDraft {
  title: string;
  description: string;
  owner: string;
  priority: CoordTaskPriority;
  planId: string;
}
