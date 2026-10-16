/**
 * What the streamer's monitor window needs beyond the playback events: the
 * queue and the approvals waiting on a mod. Neither changes through the
 * overlay stream, so the monitor route samples them and sends a snapshot
 * whenever it differs from the last one.
 */
export interface MonitorQueueEvent {
  type: "queue";
  /** False while the tenant is asleep: nothing can play until it wakes. */
  resident: boolean;
  playing: boolean;
  pending: number;
  approvals: string[];
}

interface MonitoredTenant {
  queue: { getState(): { busy: boolean; pendingCount: number } };
  approvalService: { listPending(): string[] };
}

export function buildMonitorSnapshot(tenant: MonitoredTenant | undefined): MonitorQueueEvent {
  if (!tenant) {
    return { type: "queue", resident: false, playing: false, pending: 0, approvals: [] };
  }
  const { busy, pendingCount } = tenant.queue.getState();
  return {
    type: "queue",
    resident: true,
    playing: busy,
    pending: pendingCount,
    approvals: tenant.approvalService.listPending()
  };
}
