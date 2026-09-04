import RAPIER from '@dimforge/rapier3d-compat'
import type { PolicyFile } from '@shared/sim-types'

export class DuckRobot {
  body: RAPIER.RigidBody
  joints: RAPIER.ImpulseJoint[]
  obsBuffer: Float32Array

  constructor(world: RAPIER.World, policy: PolicyFile | null) {
    this.obsBuffer = new Float32Array(22)
    this.joints = []

    // Create pelvis (root body)
    const pelvisDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 0.5, 0)
      .setLinearDamping(0.5)
      .setAngularDamping(0.5)
    this.body = world.createRigidBody(pelvisDesc)

    const pelvisCollider = RAPIER.ColliderDesc.cuboid(0.1, 0.08, 0.06)
      .setDensity(1.0)
      .setFriction(0.7)
      .setRestitution(0.1)
    world.createCollider(pelvisCollider, this.body)

    // Create legs (simplified - 2 legs with 3 joints each)
    for (let side = 0; side < 2; side++) {
      const sign = side === 0 ? -1 : 1

      // Hip
      const hipDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(sign * 0.08, 0.35, 0)
      const hipBody = world.createRigidBody(hipDesc)
      const hipCollider = RAPIER.ColliderDesc.capsule(0.08, 0.03)
        .setDensity(0.8)
      world.createCollider(hipCollider, hipBody)

      const hipJoint = world.createImpulseJoint(
        RAPIER.JointData.fixed(
          { x: 0, y: -0.08, z: 0 },
          { x: 0, y: 0, z: 0, w: 1 },
          { x: 0, y: 0, z: 0 },
          { x: 0, y: 0, z: 0, w: 1 }
        ),
        this.body,
        hipBody,
        true
      ) as RAPIER.ImpulseJoint
      this.joints.push(hipJoint)

      // Knee
      const kneeDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(sign * 0.08, 0.15, 0)
      const kneeBody = world.createRigidBody(kneeDesc)
      const kneeCollider = RAPIER.ColliderDesc.capsule(0.08, 0.03)
        .setDensity(0.8)
      world.createCollider(kneeCollider, kneeBody)

      const kneeJoint = world.createImpulseJoint(
        RAPIER.JointData.fixed(
          { x: 0, y: -0.1, z: 0 },
          { x: 0, y: 0, z: 0, w: 1 },
          { x: 0, y: 0.1, z: 0 },
          { x: 0, y: 0, z: 0, w: 1 }
        ),
        hipBody,
        kneeBody,
        true
      ) as RAPIER.ImpulseJoint
      this.joints.push(kneeJoint)

      // Ankle
      const ankleDesc = RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(sign * 0.08, 0.02, 0)
      const ankleBody = world.createRigidBody(ankleDesc)
      const ankleCollider = RAPIER.ColliderDesc.ball(0.04)
        .setDensity(1.0)
        .setFriction(0.9)
      world.createCollider(ankleCollider, ankleBody)

      const ankleJoint = world.createImpulseJoint(
        RAPIER.JointData.fixed(
          { x: 0, y: -0.065, z: 0 },
          { x: 0, y: 0, z: 0, w: 1 },
          { x: 0, y: 0.065, z: 0 },
          { x: 0, y: 0, z: 0, w: 1 }
        ),
        kneeBody,
        ankleBody,
        true
      ) as RAPIER.ImpulseJoint
      this.joints.push(ankleJoint)
    }
  }

  getObservation(): Float32Array {
    const angVel = this.body.angvel()

    // Simplified observation: [ang_vel(3), gravity_proj(3), joint_pos(6), joint_vel(6), last_action(4)]
    this.obsBuffer[0] = angVel.x
    this.obsBuffer[1] = angVel.y
    this.obsBuffer[2] = angVel.z

    // Projected gravity (simplified)
    this.obsBuffer[3] = 0
    this.obsBuffer[4] = 0
    this.obsBuffer[5] = -1

    // Joint positions (simplified - zeros for now)
    for (let i = 0; i < 6; i++) {
      this.obsBuffer[6 + i] = 0
    }

    // Joint velocities
    for (let i = 0; i < 6; i++) {
      this.obsBuffer[12 + i] = 0
    }

    // Last action (zeros)
    for (let i = 0; i < 4; i++) {
      this.obsBuffer[18 + i] = 0
    }

    return this.obsBuffer
  }

  applyActions(actions: Float32Array): void {
    // Apply PD control to joints (simplified - full implementation in M5)
    // For now, just apply small impulses based on actions
    // Fixed joints don't support motor control yet
  }

  reset(): void {
    this.body.setTranslation({ x: 0, y: 0.5, z: 0 }, true)
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true)
    this.body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true)
  }
}
