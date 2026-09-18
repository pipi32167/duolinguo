#!/usr/bin/env node
/**
 * Runs the API and the Vite dev server together, with one shared prefix so the
 * output stays readable. No extra dependency on purpose.
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const procs = [
  { name: 'server', color: '\u001b[32m', cwd: path.join(root, 'server'), args: ['run', 'dev'] },
  { name: 'web   ', color: '\u001b[36m', cwd: path.join(root, 'web'), args: ['run', 'dev'] },
]

const children = procs.map(({ name, color, cwd, args }) => {
  const child = spawn('npm', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env })
  const label = `${color}[${name}]\u001b[0m`
  const pipe = (stream, sink) => {
    stream.setEncoding('utf8')
    let buffer = ''
    stream.on('data', (chunk) => {
      buffer += chunk
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) sink.write(`${label} ${line}\n`)
    })
  }
  pipe(child.stdout, process.stdout)
  pipe(child.stderr, process.stderr)
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      process.stderr.write(`${label} exited with code ${code}\n`)
    }
  })
  return child
})

const shutdown = () => {
  for (const child of children) child.kill('SIGTERM')
  setTimeout(() => process.exit(0), 200)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

console.log(`
  Lingo dev
  ─────────────────────────────────────────
  web   →  http://localhost:5173
  api   →  http://localhost:8787
  admin →  http://localhost:5173/admin   (配置 baseurl / apikey / model)
`)
