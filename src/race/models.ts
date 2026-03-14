export type RaceStatus =
  | 'not_started'
  | 'racing'
  | 'finished_validating'
  | 'official'
  | 'incomplete'
  | 'dsq'

export type StageType = 'anchor' | 'block'
export type CheckpointKind = 'start' | 'checkpoint' | 'finish'

export type CheckpointDef = {
  checkpointId: string
  code: string
  name?: string
  kind: CheckpointKind
}

export type RouteStageDef = {
  stageNo: number
  stageType: StageType
  stageCode: string // e.g. '1', 'A', 'B', 'C'
  checkpoints: CheckpointDef[]
}

export type RouteDefinition = {
  eventId: string
  routeId: string
  routeCode: string
  strictOrder: true
  stages: RouteStageDef[]
}

export type AthleteBrief = {
  athleteId: string
  fullName: string
  email?: string
  phone?: string
  categoryName?: string
}

export type BibAssignment = {
  bibId: string
  bibNumber: string
}

export type RacePackage = {
  eventId: string
  eventTitle: string
  stageType: 'qualifier' | 'final'
  athlete: AthleteBrief
  bib: BibAssignment
  route: RouteDefinition
  downloadedAt: number
}

export type RouteProgress = {
  stageIndex: number
  checkpointIndex: number
  completedCheckpointIds: string[]
}

export type RaceSessionLocal = {
  localSessionId: string
  eventId: string
  athleteId: string
  bibId: string
  routeId: string
  deviceId: string
  status: RaceStatus
  startedAtDevice?: number
  finishedAtDevice?: number
  progress: RouteProgress
  active: boolean
  createdAt: number
  updatedAt: number
}

export type ScanEventLocal = {
  localScanId: string
  localSessionId: string
  eventId: string
  checkpointId: string
  checkpointCode: string
  scannedAtDevice: number
  qrRaw: string
  qrType: 'start' | 'checkpoint' | 'finish'
  isValid: boolean
  validationReason: string | null
  expectedNextCheckpointId: string | null
  stageNo: number | null
  synced: boolean
  createdAt: number
}

export type LeaderboardEntry = {
  localSessionId: string
  athleteName: string
  bibNumber: string
  status: RaceStatus
  provisionalTimeMs?: number
  officialTimeMs?: number
  lastCheckpointCode?: string
  updatedAt: number
}
