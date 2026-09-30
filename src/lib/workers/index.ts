import 'dotenv/config'
import type { Worker } from 'bullmq'
import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { createImageWorker } from './image.worker'
import { createVideoWorker } from './video.worker'
import { createVoiceWorker } from './voice.worker'
import { createTextWorker } from './text.worker'
import { createMembershipWorker } from './membership.worker'

// 各 worker 的 job data 类型不同，这里统一按 Worker 处理；
// 失败日志里的 taskId/taskType 仅用于观测，缺失时留空。
const workers: Worker[] = [
  createImageWorker(),
  createVideoWorker(),
  createVoiceWorker(),
  createTextWorker(),
  createMembershipWorker(),
]

_ulogInfo('[Workers] started:', workers.length)

for (const worker of workers) {
  worker.on('ready', () => {
    _ulogInfo(`[Workers] ready: ${worker.name}`)
  })

  worker.on('error', (err) => {
    _ulogError(`[Workers] error: ${worker.name}`, err.message)
  })

  worker.on('failed', (job, err) => {
    _ulogError(`[Workers] job failed: ${worker.name}`, {
      jobId: job?.id,
      taskId: job?.data?.taskId,
      taskType: job?.data?.type,
      error: err.message,
    })
  })
}

async function shutdown(signal: string) {
  _ulogInfo(`[Workers] shutdown signal: ${signal}`)
  await Promise.all(workers.map(async (worker) => await worker.close()))
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
