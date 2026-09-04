#!/usr/bin/env node

/**
 * Download python-build-standalone for the target platform.
 *
 * Usage:
 *   node scripts/fetch-python.mjs [platform]
 *
 * Platforms: win, mac-arm, mac-x64, linux-x64 (default: current platform)
 *
 * Downloads to: resources/python/
 */

import { existsSync, writeFileSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const PYTHON_DIR = join(ROOT, 'resources', 'python')

const RELEASES = {
  win: {
    url: 'https://github.com/indygreg/python-build-standalone/releases/download/20241206/cpython-3.12.8+20241206-x86_64-pc-windows-msvc-install_only.tar.gz',
    exe: 'python/python.exe'
  },
  'mac-arm': {
    url: 'https://github.com/indygreg/python-build-standalone/releases/download/20241206/cpython-3.12.8+20241206-aarch64-apple-darwin-install_only.tar.gz',
    exe: 'python/bin/python3'
  },
  'mac-x64': {
    url: 'https://github.com/indygreg/python-build-standalone/releases/download/20241206/cpython-3.12.8+20241206-x86_64-apple-darwin-install_only.tar.gz',
    exe: 'python/bin/python3'
  },
  'linux-x64': {
    url: 'https://github.com/indygreg/python-build-standalone/releases/download/20241206/cpython-3.12.8+20241206-x86_64-unknown-linux-gnu-install_only.tar.gz',
    exe: 'python/bin/python3'
  }
}

function detectPlatform() {
  if (process.platform === 'win32') return 'win'
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'mac-arm'
  if (process.platform === 'darwin' && process.arch === 'x64') return 'mac-x64'
  if (process.platform === 'linux' && process.arch === 'x64') return 'linux-x64'
  throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`)
}

async function download(url, dest) {
  console.log(`Downloading: ${url}`)
  const response = await fetch(url, { redirect: 'follow' })

  if (!response.ok) {
    throw new Error(`Download failed: ${response.status} ${response.statusText}`)
  }

  const total = parseInt(response.headers.get('content-length') || '0', 10)
  let downloaded = 0

  const reader = response.body.getReader()
  const chunks = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    downloaded += value.byteLength
    if (total > 0) {
      const pct = ((downloaded / total) * 100).toFixed(1)
      process.stdout.write(`\r  ${pct}% (${(downloaded / 1024 / 1024).toFixed(1)} MB)`)
    }
  }
  console.log('\n  Download complete')

  const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)))
  writeFileSync(dest, buffer)
}

async function main() {
  const platformArg = process.argv[2]
  const platform = platformArg || detectPlatform()

  const config = RELEASES[platform]
  if (!config) {
    console.error(`Unknown platform: ${platform}`)
    console.error(`Available: ${Object.keys(RELEASES).join(', ')}`)
    process.exit(1)
  }

  console.log(`Platform: ${platform}`)
  console.log(`Target: ${PYTHON_DIR}`)

  if (existsSync(PYTHON_DIR)) {
    console.log('Removing existing Python runtime...')
    await rm(PYTHON_DIR, { recursive: true, force: true })
  }

  await mkdir(PYTHON_DIR, { recursive: true })

  const tarball = join(PYTHON_DIR, 'python.tar.gz')
  await download(config.url, tarball)

  console.log('Extracting...')
  execSync(`tar -xzf "${tarball}" -C "${PYTHON_DIR}"`, { stdio: 'inherit' })

  await rm(tarball)

  const exePath = join(PYTHON_DIR, config.exe)
  console.log(`\nPython runtime installed to: ${PYTHON_DIR}`)
  console.log(`Executable: ${exePath}`)
  console.log('\nDone!')
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
