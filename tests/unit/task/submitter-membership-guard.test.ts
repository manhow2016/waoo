import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  provider: {
    findMany: vi.fn(),
  },
  userPreference: {
    findUnique: vi.fn(),
  },
}))

const membershipMock = vi.hoisted(() => ({
  getMembershipStatus: vi.fn(),
}))

const createTaskMock = vi.hoisted(() => vi.fn(async () => ({
  task: { id: 'task-1', payload: {}, billingInfo: null },
  deduped: false,
})))

const addTaskJobMock = vi.hoisted(() => vi.fn(async () => ({ id: 'job-1' })))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/membership', () => membershipMock)
vi.mock('@/lib/task/queues', () => ({ addTaskJob: addTaskJobMock }))
vi.mock('@/lib/task/publisher', () => ({ publishTaskEvent: vi.fn(async () => ({})) }))
vi.mock('@/lib/run-runtime/service', () => ({
  attachTaskToRun: vi.fn(async () => undefined),
  createRun: vi.fn(async () => ({ id: 'run-1' })),
  findReusableActiveRun: vi.fn(async () => null),
}))
vi.mock('@/lib/task/service', () => ({
  createTask: createTaskMock,
  getTaskById: vi.fn(async () => null),
  markTaskEnqueueFailed: vi.fn(async () => undefined),
  markTaskEnqueued: vi.fn(async () => undefined),
  markTaskFailed: vi.fn(async () => undefined),
  rollbackTaskBillingForTask: vi.fn(async () => undefined),
  updateTaskBillingInfo: vi.fn(async () => undefined),
  updateTaskPayload: vi.fn(async () => undefined),
}))

import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'

const FREE_MEMBERSHIP = {
  level: 0,
  plan: null,
  expireAt: null,
  isActive: false,
  allowAllProviders: false,
}

const PAID_MEMBERSHIP = {
  level: 1,
  plan: null,
  expireAt: null,
  isActive: true,
  allowAllProviders: true,
}

const PROVIDER_ROWS = [
  { code: 'token61', isDefault: true },
  { code: 'bailian', isDefault: false },
]

/** 构造用户默认模型配置（未列出的字段一律为 null） */
function installDefaultModels(selections: Record<string, string | null>) {
  prismaMock.userPreference.findUnique.mockResolvedValue({
    analysisModel: null,
    characterModel: null,
    locationModel: null,
    storyboardModel: null,
    editModel: null,
    videoModel: null,
    audioModel: null,
    lipSyncModel: null,
    voiceDesignModel: null,
    ...selections,
  })
}

function buildSubmitParams() {
  return {
    userId: 'user-1',
    locale: 'zh' as const,
    projectId: 'project-1',
    type: TASK_TYPE.ANALYZE_NOVEL,
    targetType: 'project',
    targetId: 'project-1',
  }
}

describe('task submitter / 入队前会员准入校验', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.BILLING_MODE = 'OFF'
    prismaMock.provider.findMany.mockResolvedValue(PROVIDER_ROWS)
    installDefaultModels({})
  })

  it('免费账号把默认模型指向非默认供应商时拒绝入队，且不创建任务', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)
    installDefaultModels({ videoModel: 'bailian::wan2.7-i2v' })

    await expect(submitTask(buildSubmitParams())).rejects.toThrow(/MEMBERSHIP_REQUIRED/)

    expect(createTaskMock).not.toHaveBeenCalled()
    expect(addTaskJobMock).not.toHaveBeenCalled()
  })

  it('免费账号默认模型全部落在默认供应商时通过准入校验', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)
    installDefaultModels({
      analysisModel: 'token61::deepseek-v4-flash',
      videoModel: 'token61::wan2.7-t2v-2026-06-12',
    })

    await submitTask(buildSubmitParams())

    expect(createTaskMock).toHaveBeenCalledTimes(1)
  })

  it('账号残留其他供应商的模型配置，但未被选为默认时不影响入队', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(FREE_MEMBERSHIP)
    installDefaultModels({ analysisModel: 'token61::deepseek-v4-flash' })

    await submitTask(buildSubmitParams())

    expect(createTaskMock).toHaveBeenCalledTimes(1)
  })

  it('付费账号把默认模型指向任意供应商都不受准入限制', async () => {
    membershipMock.getMembershipStatus.mockResolvedValue(PAID_MEMBERSHIP)
    installDefaultModels({ videoModel: 'gemini-compatible:abc::veo-3.1-generate-preview' })

    await submitTask(buildSubmitParams())

    expect(createTaskMock).toHaveBeenCalledTimes(1)
  })
})
