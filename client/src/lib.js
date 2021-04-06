/**
 * A client library for the https://nft.storage/ service. It provides a convenient
 * interface for working with the [Raw HTTP API](https://nft.storage/#api-docs)
 * from a web browser or [Node.js](https://nodejs.org/) and comes bundled with
 * TS for out-of-the box type inference and better IntelliSense.
 *
 * @example
 * ```js
 * import { NFTStorage, File, Blob } from "nft.storage"
 * const client = new NFTStorage({ token: API_TOKEN })
 *
 * const cid = await client.storeBlob(new Blob(['hello world']))
 * ```
 * @module
 */
import { CID } from 'multiformats'
import * as API from './lib/interface.js'
import * as Token from './token.js'
import { fetch, File, Blob, FormData } from './platform.js'

const GATEWAY = new URL('https://gateway.ipfs.io/')
const ENDPOINT = new URL('https://nft.storage')

/**
 * @implements API.Service
 */
class NFTStorage {
  /**
   * Constructs a client bound to the given `options.token` and
   * `options.endpoint`.
   *
   * @example
   * ```js
   * import { NFTStorage, File, Blob } from "nft.storage"
   * const client = new NFTStorage({ token: API_TOKEN })
   *
   * const cid = await client.storeBlob(new Blob(['hello world']))
   * ```
   * Optionally you could pass an alternative API endpoint (e.g. for testing)
   * @example
   * ```js
   * import { NFTStorage } from "nft.storage"
   * const client = new NFTStorage({
   *   token: API_TOKEN
   *   endpoint: new URL('http://localhost:8080/')
   * })
   * ```
   *
   * @param {{token: string, endpoint?:URL}} options
   */
  constructor({ token, endpoint = ENDPOINT }) {
    /**
     * Authorization token.
     *
     * @readonly
     */
    this.token = token
    /**
     * Service API endpoint `URL`.
     * @readonly
     */
    this.endpoint = endpoint
  }

  /**
   * @hidden
   * @param {string} token
   */
  static auth(token) {
    return { Authorization: `Bearer ${token}` }
  }
  /**
   * @param {API.Service} service
   * @param {Blob} blob
   * @returns {Promise<API.CIDString>}
   */
  static async storeBlob({ endpoint, token }, blob) {
    const url = new URL('/api/upload', endpoint)

    const request = await fetch(url.toString(), {
      method: 'POST',
      headers: NFTStorage.auth(token),
      body: blob,
    })
    const result = await request.json()

    if (result.ok) {
      return result.value.cid
    } else {
      throw new Error(result.error.message)
    }
  }
  /**
   * @param {API.Service} service
   * @param {Iterable<File>} files
   * @returns {Promise<API.CIDString>}
   */
  static async storeDirectory({ endpoint, token }, files) {
    const url = new URL('/api/upload', endpoint)
    const body = new FormData()
    for (const file of files) {
      body.append('file', file, file.name)
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: NFTStorage.auth(token),
      body,
    })
    const result = await response.json()

    if (result.ok) {
      return result.value.cid
    } else {
      throw new Error(result.error.message)
    }
  }

  /**
   * @template {API.TokenInput} T
   * @param {API.Service} service
   * @param {T} data
   * @returns {Promise<API.StoreResult<T>>}
   */
  static async store(
    { endpoint, token },
    { name, description, image, properties, decimals, localization }
  ) {
    const url = new URL(`/api/store`, endpoint)
    // Just validate that expected field are present
    if (typeof name !== 'string') {
      throw new TypeError(
        'string property `name` identifying the asset is required'
      )
    }
    if (typeof description != 'string') {
      throw new TypeError(
        'string property `description` describing asset is required'
      )
    }

    if (!(image instanceof Blob) || !image.type.startsWith('image/')) {
      throw new TypeError(
        'proprety `image` must be a Blob or File object with `image/*` mime type'
      )
    }
    if (typeof decimals !== 'undefined' && typeof decimals != 'number') {
      throw new TypeError('proprety `decimals` must be an integer value')
    }

    const body = new FormData()
    const data = Token.encode(
      { name, description, image, properties, decimals, localization },
      body
    )

    body.set('meta', JSON.stringify(data))

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: NFTStorage.auth(token),
      body,
    })

    /** @type {API.StoreResponse<T>} */
    const result = await response.json()

    if (result.ok === true) {
      const { value } = result
      const data = Token.decode(value.data)

      return {
        ipld: CID.parse(value.ipld),
        metadata: new URL(value.metadata.href),
        data,
        embed: Token.embed(data, {
          gateway: GATEWAY,
        }),
      }
    } else {
      throw new Error(result.error.message)
    }
  }
  /**
   * @param {API.Service} service
   * @param {string} cid
   * @returns {Promise<API.StatusResult>}
   */
  static async status({ endpoint, token }, cid) {
    const url = new URL(`/api/${cid}`, endpoint)
    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: NFTStorage.auth(token),
    })
    const result = await response.json()

    if (result.ok) {
      return {
        cid: result.value.cid,
        deals: result.value.deals,
        size: result.value.size,
        pin: result.value.pin,
        created: new Date(result.value.created),
      }
    } else {
      throw new Error(result.error.message)
    }
  }

  /**
   * @param {API.Service} service
   * @param {string} cid
   * @returns {Promise<void>}
   */
  static async delete({ endpoint, token }, cid) {
    const url = new URL(`/api/${cid}`, endpoint)
    const response = await fetch(url.toString(), {
      method: 'DELETE',
      headers: NFTStorage.auth(token),
    })
    const result = await response.json()
    if (!result.ok) {
      throw new Error(result.error.message)
    }
  }

  // Just a sugar so you don't have to pass around endpoint and token around.

  /**
   * Stores a single file and returns the corresponding Content Identifier (CID).
   * Takes a [Blob](https://developer.mozilla.org/en-US/docs/Web/API/Blob/Blob)
   * or a [File](https://developer.mozilla.org/en-US/docs/Web/API/File). Note
   * that no file name or file metadata is retained.
   *
   * @example
   * ```js
   * const content = new Blob(['hello world'])
   * const cid = await client.storeBlob(content)
   * cid //> 'Qmf412jQZiuVUtdgnB36FXFX7xg5V6KEbSJ4dpQuhkLyfD'
   * ```
   *
   * @param {Blob} blob
   */
  storeBlob(blob) {
    return NFTStorage.storeBlob(this, blob)
  }
  /**
   * Stores a directory of files and returns a CID for the directory.
   *
   * @example
   * ```js
   * const cid = await client.storeDirectory([
   *   new File(['hello world'], 'hello.txt'),
   *   new File([JSON.stringify({'from': 'incognito'}, null, 2)], 'metadata.json')
   * ])
   * cid //>
   * ```
   *
   * Argument can be a [FileList](https://developer.mozilla.org/en-US/docs/Web/API/FileList)
   * instance as well, in which case directory structure will be retained.
   *
   * @param {Iterable<File>} files
   */
  storeDirectory(files) {
    return NFTStorage.storeDirectory(this, files)
  }
  /**
   * Returns current status of the stored content by its CID.
   * @example
   * ```js
   * const status = await client.status('Qmf412jQZiuVUtdgnB36FXFX7xg5V6KEbSJ4dpQuhkLyfD')
   * ```
   *
   * @param {string} cid
   */
  status(cid) {
    return NFTStorage.status(this, cid)
  }
  /**
   * Removes stored content by its CID from the service.
   *
   * > Please note that even if content is removed from the service other nodes
   * that have replicated it might still continue providing it.
   *
   * @example
   * ```js
   * await client.delete('Qmf412jQZiuVUtdgnB36FXFX7xg5V6KEbSJ4dpQuhkLyfD')
   * ```
   *
   * @param {string} cid
   */
  delete(cid) {
    return NFTStorage.delete(this, cid)
  }

  /**
   * @template {API.TokenInput} T
   * @param {T} token
   * @returns {Promise<API.StoreResult<T>>}
   */
  store(token) {
    return NFTStorage.store(this, token)
  }
}

export { NFTStorage, File, Blob, FormData, CID }

/**
 * Just to verify API compatibility.
 * @type {API.API}
 */
const api = NFTStorage
void api
