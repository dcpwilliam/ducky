/// <reference lib="webworker" />
import RAPIER from '@dimforge/rapier3d-compat'
import { DuckRobot } from './core/DuckRobot'
import { PolicyRuntime } from './core/PolicyRuntime'
import type { PolicyFile, SimCommand, SimTelemetry } from '@shared/sim-types'

declare const self: DedicatedWorkerGlobalScope

let world: RAPIER.World | null = null
let robot: DuckRobot | null = null
const policy = new PolicyRuntime()

let running = false
let speed = 1
let episode = 0
let step = 0
let totalReward = 0
const dt = 1 / 240
const substeps = 12

async function initWorld(): Promise<void> {
  await RAPIER.init()

  const gravity = { x: 0, y: -9.81, z: 0 }
  world = new RAPIER.World(gravity)
  world.timestep = dt

  robot = new DuckRobot(world, policy.isLoaded() ? null : null)
}

function stepSimulation(): void {
  if (!world || !robot) return

  // Get observation and compute action
  let action = new Float32Array(6)
  if (policy.isLoaded()) {
    const obs = robot.getObservation()
    action = policy.act(obs) as Float32Array<ArrayBuffer>
  }

  // Apply actions
  robot.applyActions(action)

  // Step physics
  for (let i = 0; i < substeps; i++) {
    world.step()
  }

  // Compute reward (simplified)
  const pos = robot.body.translation()
  const reward = pos.x * 0.1 // Reward for moving forward

  step++
  totalReward += reward

  // Check episode end
  if (step >= 1000 || pos.y < 0.1) {
    episode++
    step = 0
    totalReward = 0
    robot.reset()
  }
}

function getTelemetry(): SimTelemetry {
  if (!robot) {
    return {
      timestamp: Date.now(),
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      obsVector: [],
      actions: [],
      reward: 0,
      episodeReward: 0,
      episodeLength: 0,
      jointTargets: []
    }
  }

  const pos = robot.body.translation()
  const vel = robot.body.linvel()
  const obs = robot.getObservation()

  return {
    timestamp: Date.now(),
    position: { x: pos.x, y: pos.y, z: pos.z },
    velocity: { x: vel.x, y: vel.y, z: vel.z },
    obsVector: Array.from(obs),
    actions: [],
    reward: totalReward,
    episodeReward: totalReward,
    episodeLength: step,
    jointTargets: []
  }
}

self.onmessage = async (e: MessageEvent<SimCommand>) => {
  const cmd = e.data

  switch (cmd.type) {
    case 'init':
      await initWorld()
      self.postMessage({ type: 'ready' })
      break

    case 'start':
      running = true
      break

    case 'stop':
      running = false
      break

    case 'reset':
      if (robot) {
        robot.reset()
        episode = 0
        step = 0
        totalReward = 0
      }
      break

    case 'setSpeed':
      speed = cmd.speed ?? 1
      break

    case 'loadPolicy':
      if (cmd.policy) {
        policy.load(cmd.policy as PolicyFile)
      }
      break

    case 'tick':
      if (running && world && robot) {
        for (let i = 0; i < speed; i++) {
          stepSimulation()
        }
        const telemetry = getTelemetry()
        self.postMessage({ type: 'telemetry', telemetry })
      }
      break
  }
}
