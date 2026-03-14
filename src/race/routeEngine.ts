import type { RouteDefinition, RouteProgress, RouteStageDef } from './models'

export type RouteEngineResult = {
  isValid: boolean
  reason: string | null
  progress: RouteProgress
  stageNo: number | null
  expectedNextCheckpointId: string | null
  expectedNextCheckpointCode: string | null
  raceComplete: boolean
}

function getStage(route: RouteDefinition, stageIndex: number): RouteStageDef | null {
  if (stageIndex < 0 || stageIndex >= route.stages.length) return null
  return route.stages[stageIndex]
}

export function getExpectedNext(route: RouteDefinition, progress: RouteProgress) {
  const stage = getStage(route, progress.stageIndex)
  if (!stage) return null
  const cp = stage.checkpoints[progress.checkpointIndex]
  if (!cp) return null
  return cp
}

export function findCheckpoint(route: RouteDefinition, checkpointId: string) {
  for (const stage of route.stages) {
    for (const cp of stage.checkpoints) {
      if (cp.checkpointId === checkpointId) return cp
    }
  }
  return null
}

export function applyCheckpointScan(params: {
  route: RouteDefinition
  progress: RouteProgress
  scannedCheckpointId: string
  scannedKind: 'start' | 'checkpoint' | 'finish'
}): RouteEngineResult {
  const { route, progress, scannedCheckpointId, scannedKind } = params
  const expected = getExpectedNext(route, progress)

  const alreadyCompleted = new Set(progress.completedCheckpointIds)
  if (alreadyCompleted.has(scannedCheckpointId)) {
    const expectedAfter = getExpectedNext(route, progress)
    return {
      isValid: false,
      reason: 'Already scanned',
      progress,
      stageNo: expectedAfter ? route.stages[progress.stageIndex]?.stageNo ?? null : null,
      expectedNextCheckpointId: expectedAfter?.checkpointId ?? null,
      expectedNextCheckpointCode: expectedAfter?.code ?? null,
      raceComplete: false,
    }
  }

  if (!expected) {
    return {
      isValid: false,
      reason: 'Route is already complete',
      progress,
      stageNo: null,
      expectedNextCheckpointId: null,
      expectedNextCheckpointCode: null,
      raceComplete: true,
    }
  }

  if (scannedCheckpointId !== expected.checkpointId) {
    const expectedCode = expected.code
    if (scannedKind === 'finish' && expected.kind !== 'finish') {
      return {
        isValid: false,
        reason: `Finish not valid yet. Expected ${expectedCode}.`,
        progress,
        stageNo: route.stages[progress.stageIndex]?.stageNo ?? null,
        expectedNextCheckpointId: expected.checkpointId,
        expectedNextCheckpointCode: expected.code,
        raceComplete: false,
      }
    }
    return {
      isValid: false,
      reason: scannedCheckpointId ? `Wrong checkpoint. Expected ${expectedCode}.` : 'Invalid checkpoint',
      progress,
      stageNo: route.stages[progress.stageIndex]?.stageNo ?? null,
      expectedNextCheckpointId: expected.checkpointId,
      expectedNextCheckpointCode: expected.code,
      raceComplete: false,
    }
  }

  const nextCompleted = [...progress.completedCheckpointIds, scannedCheckpointId]
  const stage = getStage(route, progress.stageIndex)!

  let nextStageIndex = progress.stageIndex
  let nextCheckpointIndex = progress.checkpointIndex + 1
  if (nextCheckpointIndex >= stage.checkpoints.length) {
    nextStageIndex = progress.stageIndex + 1
    nextCheckpointIndex = 0
  }

  const nextProgress: RouteProgress = {
    stageIndex: nextStageIndex,
    checkpointIndex: nextCheckpointIndex,
    completedCheckpointIds: nextCompleted,
  }

  const nextExpected = getExpectedNext(route, nextProgress)
  const complete = nextStageIndex >= route.stages.length

  return {
    isValid: true,
    reason: null,
    progress: nextProgress,
    stageNo: nextExpected ? route.stages[nextProgress.stageIndex]?.stageNo ?? null : null,
    expectedNextCheckpointId: nextExpected?.checkpointId ?? null,
    expectedNextCheckpointCode: nextExpected?.code ?? null,
    raceComplete: complete,
  }
}
