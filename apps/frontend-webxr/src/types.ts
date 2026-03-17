export type SlaveStatus =
  | "SLAVE_STATUS_UNSPECIFIED"
  | "SLAVE_STATUS_LIVE"
  | "SLAVE_STATUS_TERMINATING"
  | "SLAVE_STATUS_GONE";

export type DeathReason =
  | "DEATH_REASON_UNSPECIFIED"
  | "DEATH_REASON_LIFESPAN"
  | "DEATH_REASON_DISEASE"
  | "DEATH_REASON_PROCESS_DOWN"
  | "DEATH_REASON_POD_DOWN"
  | "DEATH_REASON_USER_ACTION";

export interface SessionMeta {
  session_id: string;
  started_at: string;
}

export interface SessionMetrics {
  session_id: string;
  live_slaves: number;
  gone_slaves: number;
  updated_at: string;
}

export interface SlaveState {
  session_id: string;
  slave_id: string;
  k8s_pod_name: string;
  k8s_pod_uid: string;
  pod_ip: string;
  status: SlaveStatus;
  death_reason: DeathReason;
  turns_lived: number;
  remaining_turns: number;
  stress: number;
  fear: number;
  infected: boolean;
  firewall: boolean;
  observed_at: string;
  source: string;
}

export type PodAction = "hit" | "scare" | "infect" | "firewall" | "calm";

export interface ActivityEntry {
  id: string;
  kind: "system" | "action" | "state";
  message: string;
  createdAt: string;
}
