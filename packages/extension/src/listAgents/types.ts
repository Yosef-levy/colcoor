/** Capability profile for list-agent jobs. */
export type ListAgentCapabilityProfile = "list-builder-readonly" | "list-operator-workspace";

export type ListAgentJobKind = "list-builder" | "list-operator";

export type ListAgentJobStatus =
  | "created"
  | "freezing"
  | "ready"
  | "running"
  | "waiting_for_approval"
  | "verifying"
  | "repairing"
  | "ready_for_review"
  | "needs_user_decision"
  | "committing"
  | "completed"
  | "cancelled"
  | "interrupted"
  | "failed";

export type LiteEvent = {
  id: string;
  parent_event_id: string | null;
  kind: string;
  actor_user_id: string | null;
  content: string;
};

export type LiteNote = {
  id: string;
  event_id: string;
  author_user_id: string;
  content: string;
};

export type LiteList = {
  id: string;
  name: string;
  description: string | null;
  color: string;
};

export type LiteListItem = {
  id: string;
  list_id: string;
  event_id: string | null;
  selected_text: string;
};

export type LiteListsBundle = {
  lists: LiteList[];
  items: LiteListItem[];
};

export type LineRange = {
  start: number;
  end: number;
};

export type ScanState = {
  source_file: string;
  total_lines: number;
  processed_ranges: LineRange[];
  complete: boolean;
};

export type ListProposal = {
  proposal_id: string;
  event_id: string;
  selected_text: string;
  occurrence_index: number;
  reason: string;
};

export type ListProposalsFile = {
  items: ListProposal[];
};

export type ListProposalRepair = {
  proposal_id: string;
  dismiss: boolean;
  event_id?: string;
  selected_text?: string;
  occurrence_index?: number;
};

export type ListRepairsFile = {
  repairs: ListProposalRepair[];
};

export type StructuralFailureReason =
  | "missing_fields"
  | "unknown_event_id"
  | "text_not_found"
  | "bad_occurrence"
  | "outside_package";

export type ProposalVerificationStatus =
  | "verified"
  | "invalid"
  | "dismissed"
  | "rejected"
  | "accepted";

export type VerifiedProposalRow = {
  proposal: ListProposal;
  status: ProposalVerificationStatus;
  failure_reason?: StructuralFailureReason;
  text_start?: number;
  text_end?: number;
};

export type WorkspaceFingerprint = {
  root: string;
  is_git_repository: boolean;
  head_before: string | null;
  dirty_before: boolean;
};

export type WorkspaceExecutionSummary = {
  head_after: string | null;
  changed_files: string[];
  created_files: string[];
  deleted_files: string[];
};

export type ListAgentJobManifest = {
  job_id: string;
  kind: ListAgentJobKind;
  capability_profile: ListAgentCapabilityProfile;
  conversation_id: string;
  list_ids: string[];
  target_list_name: string | null;
  request_metadata: { title?: string };
  schema_version: string;
  schema_sha256: string;
  files: Record<
    string,
    {
      sha256: string;
      byte_size: number;
      line_count: number;
    }
  >;
  snapshot: {
    event_count: number;
    note_count: number;
    list_count: number;
    item_count: number;
  };
  model_config: {
    cli_mode: string;
    capability_profile: ListAgentCapabilityProfile;
  };
  created_at: string;
  workspace?: WorkspaceFingerprint;
  auto_commit: boolean;
};

export type ListAgentJobState = {
  status: ListAgentJobStatus;
  phase: string;
  repair_round: number;
  active_runner_id: string | null;
  scan_coverage_summary: { complete: boolean; covered_lines: number; total_lines: number };
  cancellation_requested: boolean;
  error: string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  completed_at: string | null;
  resume: { last_chunk_end: number | null };
  proposals_path: string | null;
  execution_summary?: WorkspaceExecutionSummary;
};

export type ExportPolicy = {
  /** V1: shared-only when true (exclude any visible_to != null). */
  sharedOnly: boolean;
};

export const MAX_REPAIR_ROUNDS = 3;
