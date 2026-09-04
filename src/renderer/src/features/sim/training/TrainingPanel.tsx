import React, { useState, useEffect } from 'react'
import { Play, Square, TrendingUp, Download } from 'lucide-react'

interface TrainingProgress {
  iteration: number
  totalIterations: number
  meanReward: number
  kl: number
  entropy: number
  episodeLength: number
}

export function TrainingPanel(): React.ReactElement {
  const [training, setTraining] = useState(false)
  const [progress, setProgress] = useState<TrainingProgress | null>(null)
  const [iterations, setIterations] = useState(100)
  const [outputPath, setOutputPath] = useState('trained_policy.json')

  useEffect(() => {
    const unsub = window.ducky.onTrainingProgress((data: unknown) => {
      setProgress(data as TrainingProgress)
    })

    const unsubDone = window.ducky.onTrainingDone((result: unknown) => {
      setTraining(false)
      const res = result as { success: boolean; policyPath?: string; error?: string }
      if (res.success) {
        alert(`Training complete! Policy saved to ${res.policyPath}`)
      } else {
        alert(`Training failed: ${res.error}`)
      }
    })

    window.ducky.getTrainingStatus().then((status: unknown) => {
      setTraining((status as { running: boolean }).running)
    })

    return () => {
      unsub()
      unsubDone()
    }
  }, [])

  const handleStart = async (): Promise<void> => {
    try {
      await window.ducky.startTraining({
        iterations,
        steps_per_iter: 1000,
        output_path: outputPath,
        spec_path: 'specs/duck_spec.json'
      })
      setTraining(true)
      setProgress(null)
    } catch (err) {
      alert(`Failed to start training: ${err}`)
    }
  }

  const handleCancel = async (): Promise<void> => {
    await window.ducky.cancelTraining()
    setTraining(false)
  }

  const handleExport = async (): Promise<void> => {
    const result = await window.ducky.openDialog({
      filters: [{ name: 'Policy JSON', extensions: ['json'] }],
      properties: ['saveFile', 'createDirectory']
    })
    if (!result.canceled && result.filePaths[0]) {
      setOutputPath(result.filePaths[0])
    }
  }

  return (
    <div className="bg-surface-2 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-2">
          <TrendingUp size={16} />
          Training
        </h3>
        {training && (
          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
            Running
          </span>
        )}
      </div>

      <div className="space-y-3">
        {/* Configuration */}
        <div>
          <label className="text-xs text-gray-500 mb-1 block">Iterations</label>
          <input
            type="number"
            value={iterations}
            onChange={(e) => setIterations(Number(e.target.value))}
            disabled={training}
            className="w-full px-3 py-1.5 bg-surface-3 border border-white/5 rounded text-sm text-white disabled:opacity-50"
          />
        </div>

        <div>
          <label className="text-xs text-gray-500 mb-1 block">Output Path</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={outputPath}
              onChange={(e) => setOutputPath(e.target.value)}
              disabled={training}
              className="flex-1 px-3 py-1.5 bg-surface-3 border border-white/5 rounded text-sm text-white disabled:opacity-50"
            />
            <button
              onClick={handleExport}
              disabled={training}
              className="px-3 py-1.5 bg-surface-3 rounded text-sm text-gray-300 hover:bg-surface-4 disabled:opacity-50"
            >
              <Download size={14} />
            </button>
          </div>
        </div>

        {/* Controls */}
        <div className="flex gap-2">
          {training ? (
            <button
              onClick={handleCancel}
              className="flex-1 px-3 py-2 bg-red-500/20 text-red-400 rounded text-sm hover:bg-red-500/30 flex items-center justify-center gap-2"
            >
              <Square size={14} />
              Cancel
            </button>
          ) : (
            <button
              onClick={handleStart}
              className="flex-1 px-3 py-2 bg-brand-500/20 text-brand-400 rounded text-sm hover:bg-brand-500/30 flex items-center justify-center gap-2"
            >
              <Play size={14} />
              Start Training
            </button>
          )}
        </div>

        {/* Progress */}
        {progress && (
          <div className="space-y-2 pt-2 border-t border-white/5">
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Iteration</span>
              <span className="text-white font-mono">
                {progress.iteration} / {progress.totalIterations}
              </span>
            </div>
            <div className="w-full bg-surface-3 rounded-full h-1.5">
              <div
                className="bg-brand-500 h-1.5 rounded-full transition-all"
                style={{ width: `${(progress.iteration / progress.totalIterations) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Mean Reward</span>
              <span className="text-white font-mono">{progress.meanReward.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">KL Divergence</span>
              <span className="text-white font-mono">{progress.kl.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Entropy</span>
              <span className="text-white font-mono">{progress.entropy.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">Episode Length</span>
              <span className="text-white font-mono">{progress.episodeLength}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
