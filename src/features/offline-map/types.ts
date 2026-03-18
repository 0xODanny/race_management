export type LatLng = { lat: number; lon: number }

// Bounding box in WGS84 degrees.
export type BoundingBox = {
  west: number
  south: number
  east: number
  north: number
}

export type OfflineMapDownloadStatus =
  | 'not_downloaded'
  | 'downloading'
  | 'ready'
  | 'update_available'
  | 'damaged'

export type OfflineCheckpointType =
  | 'start'
  | 'checkpoint'
  | 'finish'
  | 'water'
  | 'hazard'
  | 'aid'
  | 'other'

export type OfflineCheckpoint = {
  eventId: string
  checkpointId: string
  checkpointNumber: number
  checkpointName: string
  latitude: number
  longitude: number
  type: OfflineCheckpointType
  requiredSequenceOrder: number
  radiusMeters: number
  description?: string
}

export type OfflineRouteOverlay = {
  eventId: string
  // GeoJSON Feature for course line.
  routeGeoJson: GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString>
  // Optional alternative segments (FeatureCollection of LineStrings).
  alternativeSegments?: GeoJSON.FeatureCollection<GeoJSON.LineString>
  // Optional caution polygons.
  cautionPolygons?: GeoJSON.FeatureCollection<GeoJSON.Polygon>
  updatedAt: number
}

export type TileCoord = { z: number; x: number; y: number }

export type OfflineTileManifest = {
  eventId: string
  packageVersion: string

  // Tile URL template (raster) e.g. https://tile.openstreetmap.org/{z}/{x}/{y}.png
  tileTemplateUrl: string
  tileFormat: 'png' | 'jpg' | 'webp'
  minZoom: number
  maxZoom: number

  boundingBox: BoundingBox

  approxBytes: number
  completedTileCount: number
  totalTileCount: number
}

export type OfflineEventMapPackage = {
  eventId: string
  eventName: string
  venueName: string
  packageVersion: string

  boundingBox: BoundingBox
  center: LatLng

  minZoom: number
  maxZoom: number

  checkpoints: OfflineCheckpoint[]
  route: OfflineRouteOverlay

  tileManifest: OfflineTileManifest

  downloadStatus: OfflineMapDownloadStatus
  readyOffline: boolean

  createdAt: number
  updatedAt: number
}

export type OfflineTileMetadata = {
  tileKey: string // `${eventId}:${packageVersion}:${z}:${x}:${y}`
  eventId: string
  packageVersion: string
  z: number
  x: number
  y: number
  url: string
  status: 'pending' | 'done' | 'error'
  bytes?: number
  lastError?: string
  updatedAt: number
}

export type OfflineGpsFix = {
  lat: number
  lon: number
  accuracyMeters?: number
  headingDeg?: number
  speedMps?: number
  timestamp: number
}

export type OfflineGpsBreadcrumb = {
  id?: number
  eventId: string
  localSessionId?: string
  fix: OfflineGpsFix
  createdAt: number
  synced: boolean
}

export type OfflineRaceProgress = {
  // Keyed so we can store either event-scope or session-scope progress.
  // Suggested values:
  // - `event:${eventId}`
  // - `session:${localSessionId}`
  key: string
  eventId: string
  localSessionId?: string

  lastKnownFix?: OfflineGpsFix
  lastSyncAt?: number

  createdAt: number
  updatedAt: number
}

export type OfflineMapSyncQueueItem =
  | {
      id?: number
      type: 'gps_breadcrumb'
      eventId: string
      breadcrumbId: number
      createdAt: number
    }
  | {
      id?: number
      type: 'map_progress'
      eventId: string
      createdAt: number
    }
