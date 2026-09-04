import type { PolicyFile } from '@shared/sim-types'

export class PolicyRuntime {
  private policy: PolicyFile | null = null
  private obsMean: Float32Array | null = null
  private obsStd: Float32Array | null = null

  load(policy: PolicyFile): void {
    this.policy = policy
    if (policy.obsNorm?.mean) {
      this.obsMean = new Float32Array(policy.obsNorm.mean)
    }
    if (policy.obsNorm?.std) {
      this.obsStd = new Float32Array(policy.obsNorm.std)
    }
  }

  isLoaded(): boolean {
    return this.policy !== null
  }

  act(observation: Float32Array): Float32Array {
    if (!this.policy) {
      throw new Error('Policy not loaded')
    }

    let input = observation

    // Normalize observation
    if (this.obsMean && this.obsStd) {
      input = new Float32Array(observation.length)
      for (let i = 0; i < observation.length; i++) {
        input[i] = (observation[i] - this.obsMean[i]) / (this.obsStd[i] + 1e-8)
      }
    }

    // Forward pass through MLP layers
    for (const layer of this.policy.layers) {
      const weights = new Float32Array(layer.W)
      const biases = new Float32Array(layer.b)
      const outputSize = biases.length
      const output = new Float32Array(outputSize)

      // Matrix multiply: output = weights * input + biases
      for (let i = 0; i < outputSize; i++) {
        let sum = biases[i]
        for (let j = 0; j < input.length; j++) {
          sum += weights[i * input.length + j] * input[j]
        }

        // Apply activation
        if (layer.act === 'tanh') {
          output[i] = Math.tanh(sum)
        } else if (layer.act === 'relu') {
          output[i] = Math.max(0, sum)
        } else {
          output[i] = sum
        }
      }

      input = output
    }

    // Clip output to [-1, 1]
    const action = new Float32Array(input.length)
    for (let i = 0; i < input.length; i++) {
      action[i] = Math.max(-1, Math.min(1, input[i]))
    }

    return action
  }

  getActionSize(): number {
    if (!this.policy || this.policy.layers.length === 0) {
      return 0
    }
    const lastLayer = this.policy.layers[this.policy.layers.length - 1]
    return lastLayer.b.length
  }
}
