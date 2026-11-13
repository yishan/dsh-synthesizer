/** In-memory revision tracker shared by HTTP routes and Agent tools. */
export interface SyncSnapshot {
  revision: number
  lastToolProjectId: string | null
  lastToolProjectName: string | null
  lastToolAt: number
}

export class SyncTracker {
  private revision = 0
  private lastToolProjectId: string | null = null
  private lastToolProjectName: string | null = null
  private lastToolAt = 0

  markClientSave(): void {
    this.revision += 1
  }

  markToolSave(projectId: string, projectName: string): number {
    this.revision += 1
    this.lastToolProjectId = projectId
    this.lastToolProjectName = projectName
    this.lastToolAt = Date.now()
    return this.revision
  }

  snapshot(): SyncSnapshot {
    return {
      revision: this.revision,
      lastToolProjectId: this.lastToolProjectId,
      lastToolProjectName: this.lastToolProjectName,
      lastToolAt: this.lastToolAt,
    }
  }
}
