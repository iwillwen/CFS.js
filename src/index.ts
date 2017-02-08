///<reference path="../typings/globals/node/index.d.ts" />

import * as path from 'path'
import { merge } from 'lodash'
import { localforage } from './store'

import AssetConfig from './asset'

const config = {
  logLevel: 2, // info: 0, warn: 1, error: 2
  logLevels: { INFO: 0, WARN: 1, ERROR: 2 },
  autoSave: true, // Auto save when asset created and data changed
  maxAge: 1 * 24 * 60 * 60 * 1e3
}

const Asset = AssetConfig(config)

function createAsset(assetPath: string, data: Blob) {
  const tmp = assetPath.split('?').filter(Boolean)
  const pathname = tmp[0]
  const filename = path.basename(pathname)
  const version = tmp[1] || 'default'

  const asset = new Asset(pathname, filename, data, version)

  return asset
}

function loadAsset(assetPath: string) : Promise<any> {
  return Asset.loadAsset(assetPath)
}

export default merge(config, {
  createAsset,
  loadAsset,
  store: localforage
})