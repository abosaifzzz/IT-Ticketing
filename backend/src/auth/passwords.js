import { hash, verify, Algorithm } from '@node-rs/argon2'

const options = { algorithm: Algorithm.Argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1, outputLen: 32 }

export function hashPassword(password) {
  if (typeof password !== 'string' || password.length === 0 || Buffer.byteLength(password, 'utf8') > 1024) {
    throw new Error('Password must be non-empty and at most 1024 UTF-8 bytes')
  }
  return hash(password, options)
}

export function verifyPassword(passwordHash, password) {
  return verify(passwordHash, password)
}
