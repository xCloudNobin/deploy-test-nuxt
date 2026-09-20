import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

export interface AppConfig {
  port: number
  host: string
  dataDir: string
  dbPath: string
  buildMarker: string
}

// Production entry (`node .output/server/index.mjs`) is documented to run from
// the repository root; dev runs from the project root as well.
export const ROOT = resolve(process.cwd())

function parsePort(raw: string | undefined): number {
  const port = Number.parseInt(raw ?? '3000', 10)
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`PORT must be an integer in [0, 65535], got "${raw}"`)
  }
  return port
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = env.DATA_DIR ? resolve(env.DATA_DIR) : join(ROOT, 'data')
  const dbPath = env.DATABASE_PATH
    ? resolve(env.DATABASE_PATH)
    : join(dataDir, 'taskboard.db')

  let buildMarker = env.BUILD_MARKER?.trim() ?? ''
  if (!buildMarker) {
    const versionFile = join(ROOT, 'VERSION')
    if (existsSync(versionFile)) {
      const value = readFileSync(versionFile, 'utf8').trim()
      if (value) buildMarker = value
    }
  }
  if (!buildMarker) buildMarker = 'develop'

  return {
    port: parsePort(env.PORT),
    host: env.HOST ?? '0.0.0.0',
    dataDir,
    dbPath,
    buildMarker,
  }
}