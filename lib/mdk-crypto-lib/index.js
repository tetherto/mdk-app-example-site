'use strict'

const crypto = require('node:crypto')

const enc = {
  Base64: { name: 'base64' },
  Hex: { name: 'hex' },
  Utf8: { name: 'utf8' }
}

function toBuffer (value) {
  if (Buffer.isBuffer(value)) return value
  if (value && Buffer.isBuffer(value._buf)) return value._buf
  if (typeof value === 'string') return Buffer.from(value, 'utf8')
  throw new TypeError('unsupported crypto-js value')
}

function wordArray (buf) {
  return {
    _buf: buf,
    toString (encoder) {
      if (!encoder) return buf.toString('hex')
      const encoding = encoder.name || encoder
      if (encoding === 'base64' || encoding === 'hex' || encoding === 'utf8') {
        return buf.toString(encoding)
      }
      throw new TypeError('unsupported encoder')
    }
  }
}

function SHA256 (input) {
  return wordArray(crypto.createHash('sha256').update(toBuffer(input)).digest())
}

function aesEncrypt (plaintext, key) {
  const cipher = crypto.createCipheriv('aes-256-ecb', toBuffer(key), null)
  const out = Buffer.concat([cipher.update(toBuffer(plaintext)), cipher.final()])
  return {
    toString () {
      return out.toString('base64')
    }
  }
}

function aesDecrypt (ciphertext, key) {
  const decipher = crypto.createDecipheriv('aes-256-ecb', toBuffer(key), null)
  const out = Buffer.concat([
    decipher.update(Buffer.from(String(ciphertext), 'base64')),
    decipher.final()
  ])
  return wordArray(out)
}

module.exports = {
  SHA256,
  AES: {
    encrypt: aesEncrypt,
    decrypt: aesDecrypt
  },
  enc,
  mode: { ECB: {} },
  pad: { Pkcs7: {} }
}
