import { localforage } from './store'
import { uniq } from 'lodash'

import * as path from 'path'
import { EventEmitter } from 'events'

let CFS : {
  logLevel: number,
  logLevels: { INFO: 0, WARN: 1, ERROR: 2 }
  autoSave: boolean,
  maxAge: number
} = null

class Asset extends EventEmitter {
  public path: string;
  public name: string;
  public size: number;
  public lastUpdate: number;
  public type: string;
  public version: string;
  private loaded: boolean = false;
  private $data: Blob;

  constructor(path: string, version?: string);
  constructor(path: string, name: string, data: Blob, version: string);
  constructor(path: string, name?: string, data?: Blob, version = 'default') {
    super()

    this.path = path

    if (data) {
      this.name = name
      this.$data = data
      this.size = data.size
      this.type = data.type
      this.version = version
      this.lastUpdate = Date.now()
      this.loaded = true
      this.emit('loaded')

      if (CFS.autoSave) {
        this.save()
          .then(() => this.emit('saved'))
      }
    } else {
      this.version = name || 'default'
      this.load()
        .then(() => this.loaded = true)
    }
  }

  save() : Promise<any> {
    return new Promise((resolve, reject) => {
      localforage.setItem(`cfs:meta:${this.path}:${this.version}`, {
        name: this.name,
        lastUpdate: this.lastUpdate
      })
        .then(() => localforage.getItem(`cfs:meta:versions:${this.path}`))
        .then(val => new Promise((resolve, reject) => {
          const versions = Array.isArray(val) ? val : []
          versions.push(this.version)
          
          localforage.setItem(`cfs:meta:versions:${this.path}`, uniq(versions))
            .then(() => resolve(versions))
            .catch(reject)
        }))
        .then(() => localforage.setItem(`cfs:fs:${this.path}:${this.version}`, this.data))
        .then(value => {
          if (CFS.logLevel === CFS.logLevels.INFO) {
            console.info(`[CFS][INFO] Asset '${this.path}' (version ${this.version}) saved.`)
          }
          this.loaded = true
          this.emit('loaded')
          resolve()
        })
        .catch(err => {
          const message = err.message
          err.message = `[CFS][ERROR] Saving asset '${this.path}}' (version ${this.version}) occured an error: ${message}`
          console.error(err)
          reject(err)
        })
    })
  }

  load() : Promise<Blob> {
    return new Promise((resolve, reject) => {
      localforage.getItem(`cfs:meta:${this.path}:${this.version}`)
        .then(info => {
          if (!info) {
            return Promise.reject(new Error('Asset not found.'))
          }

          const { name, lastUpdate } = info
          this.name = name
          this.lastUpdate = lastUpdate

          // Check expires
          const now = Date.now()

          if ((now - lastUpdate) > CFS.maxAge) {
            this.remove()
              .then(() => {
                this.emit('expire', this.version)
                reject(new Error('This asset was expired.'))
              })
          } else {
            return localforage.getItem(`cfs:fs:${this.path}:${this.version}`)
              .then((data: Blob) => {
                this.$data = data
                this.size = data.size
                this.type = data.type
                this.loaded = true
                this.emit('loaded')

                if (CFS.logLevel === CFS.logLevels.INFO) {
                  console.info(`[CFS][INFO] Asset '${this.path}' (version ${this.version}) loaded.`)
                }

                resolve(this.data)
              })
              .catch(err => {
                const message = err.message
                err.message = `[CFS][ERROR] Loading asset '${this.path}}' (version ${this.version}) occured an error: ${message}`
                console.error(err)
                reject(err)
              })
          }
        })
        .catch(err => {
          const message = err.message
          err.message = `[CFS][ERROR] Loading asset '${this.path}}' (version ${this.version}) occured an error: ${message}`
          console.error(err)
          reject(err)
        })
    })
  }

  remove() : Promise<string> {
    return localforage.removeItem(`cfs:meta:${this.path}:${this.version}`)
      .then(() => localforage.getItem(`cfs:meta:versions:${this.path}`))
      .then(versions => {
        const index = versions.indexOf(this.version)

        if (index >= 0) {
          versions.splice(index, 1)
        }

        return localforage.setItem(`cfs:meta:versions:${this.path}`, versions)
      })
      .then(() => localforage.removeItem(`cfs:fs:${this.path}:${this.version}`))
      .then(() => {
        this.loaded = false
        this.emit('removed')

        return Promise.resolve(this.version)
      })
      .catch(err => {
        const message = err.message
        err.message = `[CFS][ERROR] Removing asset '${this.path}}' (version ${this.version}) occured an error: ${message}`
        console.error(err)

        return Promise.reject(err)
      })
  }

  versions() : Promise<string[]> {
    return localforage.getItem(`cfs:meta:versions:${this.path}`)
  }

  loadVersion(version: string) : Promise<Asset> {
    this.loaded = false
    return new Promise((resolve, reject) => {
      localforage.getItem(`cfs:meta:${this.path}:${version}`)
        .then(info => {
          if (!info) {
            return Promise.reject(new Error('Asset not found.'))
          }

          const { lastUpdate } = info
          this.lastUpdate = lastUpdate

          return localforage.getItem(`cfs:fs:${this.path}:${version}`)
        })
        .then((data: Blob) => {
          this.$data = data
          this.type = data.type
          this.size = data.size
          this.version = version

          this.loaded = true
          this.emit('loaded')
        })
        .catch(err => {
          const message = err.message
          err.message = `[CFS][ERROR] Switching asset version '${this.path}}' (version ${this.version}) occured an error: ${message}`
          console.error(err)

          return Promise.reject(err)
        })
    })
  }

  get data() : Blob {
    return this.$data
  }

  set data(data: Blob) {
    this.$data = data

    if (CFS.autoSave) {
      this.save()
    }
  }

  static loadAsset(assetPath) : Promise<Asset> {
    const tmp = assetPath.split('?').filter(Boolean)
    const pathname = tmp[0]
    const filename = path.basename(pathname)
    const version = tmp[1] || 'default'

    return new Promise((resolve, reject) => {
      localforage.getItem(`cfs:meta:${pathname}:${version}`)
        .then(exists => {
          if (exists) {
            resolve(new Asset(pathname, version))
          } else {
            reject(new Error(`[CFS][ERROR] Asset '${path}' not found.`))
          }
        })
        .catch(reject)
    })
  }
}

export default (_CFS) : typeof Asset => {
  CFS = _CFS
  return Asset
}