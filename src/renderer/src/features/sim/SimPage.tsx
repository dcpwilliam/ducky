import React, { useRef, useEffect, useState } from 'react'
import { Play, Pause, RotateCcw, Upload, Target, Box, Mountain } from 'lucide-react'
import * as THREE from 'three'
import type { SimTelemetry, PolicyFile } from '@shared/sim-types'
import { TrainingPanel } from './training/TrainingPanel'

export function SimPage(): React.ReactElement {
  const canvasRef = useRef<HTMLDivElement>(null)
  const workerRef = useRef<Worker | null>(null)
  const [running, setRunning] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [policyLoaded, setPolicyLoaded] = useState(false)
  const [telemetry, setTelemetry] = useState<SimTelemetry>({
    timestamp: 0,
    position: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    obsVector: [],
    actions: [],
    reward: 0,
    episodeReward: 0,
    episodeLength: 0,
    jointTargets: []
  })

  // Initialize worker
  useEffect(() => {
    const worker = new Worker(
      new URL('./engine/SimWorker.ts', import.meta.url),
      { type: 'module' }
    )

    worker.onmessage = (e) => {
      const msg = e.data
      if (msg.type === 'ready') {
        console.log('SimWorker ready')
      } else if (msg.type === 'telemetry') {
        setTelemetry(msg.telemetry)
      }
    }

    worker.postMessage({ type: 'init' })
    workerRef.current = worker

    return () => {
      worker.terminate()
    }
  }, [])

  // Send commands to worker
  useEffect(() => {
    if (!workerRef.current) return

    if (running) {
      workerRef.current.postMessage({ type: 'start' })
    } else {
      workerRef.current.postMessage({ type: 'stop' })
    }
  }, [running])

  useEffect(() => {
    if (!workerRef.current) return
    workerRef.current.postMessage({ type: 'setSpeed', speed })
  }, [speed])

  // Tick loop
  useEffect(() => {
    let animId: number
    const tick = (): void => {
      if (workerRef.current && running) {
        workerRef.current.postMessage({ type: 'tick' })
      }
      animId = requestAnimationFrame(tick)
    }
    animId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animId)
  }, [running])

  useEffect(() => {
    if (!canvasRef.current) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0a0a0f)
    scene.fog = new THREE.Fog(0x0a0a0f, 20, 60)

    const camera = new THREE.PerspectiveCamera(60, canvasRef.current.clientWidth / canvasRef.current.clientHeight, 0.1, 100)
    camera.position.set(0, 3, 6)
    camera.lookAt(0, 0.5, 0)

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(canvasRef.current.clientWidth, canvasRef.current.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.shadowMap.enabled = true
    canvasRef.current.appendChild(renderer.domElement)

    // Lighting
    const ambient = new THREE.AmbientLight(0x404060, 0.5)
    scene.add(ambient)

    const dirLight = new THREE.DirectionalLight(0xffffff, 1)
    dirLight.position.set(5, 10, 5)
    dirLight.castShadow = true
    dirLight.shadow.mapSize.set(1024, 1024)
    scene.add(dirLight)

    // Ground
    const groundGeo = new THREE.PlaneGeometry(40, 40, 40, 40)
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a26,
      roughness: 0.9,
      metalness: 0.1
    })
    const ground = new THREE.Mesh(groundGeo, groundMat)
    ground.rotation.x = -Math.PI / 2
    ground.receiveShadow = true
    scene.add(ground)

    // Grid
    const grid = new THREE.GridHelper(40, 40, 0x333355, 0x222244)
    grid.position.y = 0.01
    scene.add(grid)

    // Duck robot (stylized)
    const duck = createDuckRobot()
    duck.position.set(0, 0.4, 0)
    scene.add(duck)

    // Target marker
    const targetGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.02, 16)
    const targetMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xf59e0b, emissiveIntensity: 0.5 })
    const target = new THREE.Mesh(targetGeo, targetMat)
    target.position.set(3, 0.01, 0)
    scene.add(target)

    // Target ring
    const ringGeo = new THREE.RingGeometry(0.2, 0.25, 32)
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.5 })
    const ring = new THREE.Mesh(ringGeo, ringMat)
    ring.rotation.x = -Math.PI / 2
    ring.position.set(3, 0.02, 0)
    scene.add(ring)

    // Animation
    let animId: number
    const clock = new THREE.Clock()

    const animate = (): void => {
      animId = requestAnimationFrame(animate)
      const t = clock.getElapsedTime()

      // Sync duck position with physics telemetry
      if (telemetry.position) {
        duck.position.set(
          telemetry.position.x,
          telemetry.position.y + 0.4,
          telemetry.position.z
        )
      }

      // Animate legs when running
      if (running) {
        duck.children.forEach((child, i) => {
          if (child.userData.isLeg) {
            child.rotation.x = Math.sin(t * 8 + i * Math.PI) * 0.3
          }
        })
      }

      ring.rotation.z = t * 2
      target.material.emissiveIntensity = 0.3 + Math.sin(t * 3) * 0.2

      renderer.render(scene, camera)
    }
    animate()

    // Resize handler
    const handleResize = (): void => {
      if (!canvasRef.current) return
      const w = canvasRef.current.clientWidth
      const h = canvasRef.current.clientHeight
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h)
    }
    window.addEventListener('resize', handleResize)

    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', handleResize)
      renderer.dispose()
      canvasRef.current?.removeChild(renderer.domElement)
    }
  }, [running, speed])

  const handleLoadPolicy = async (): Promise<void> => {
    const result = await window.ducky.openDialog({
      filters: [{ name: 'Policy JSON', extensions: ['json'] }]
    })
    if (!result.canceled && result.filePaths[0]) {
      try {
        const content = await window.ducky.readFile(result.filePaths[0]) as string
        const policy = JSON.parse(content) as PolicyFile
        if (workerRef.current) {
          workerRef.current.postMessage({ type: 'loadPolicy', policy })
        }
        setPolicyLoaded(true)
      } catch (err) {
        console.error('Failed to load policy:', err)
        alert('Failed to load policy file')
      }
    }
  }

  const handleReset = (): void => {
    setRunning(false)
    if (workerRef.current) {
      workerRef.current.postMessage({ type: 'reset' })
    }
  }

  return (
    <div className="flex h-full -m-6">
      {/* 3D Viewport */}
      <div className="flex-1 relative">
        <div ref={canvasRef} className="w-full h-full" />

        {/* Overlay controls */}
        <div className="absolute bottom-4 left-4 flex gap-2">
          <button
            onClick={() => setRunning(!running)}
            className={`p-2 rounded-lg backdrop-blur ${running ? 'bg-red-500/30 text-red-300' : 'bg-green-500/30 text-green-300'}`}
          >
            {running ? <Pause size={18} /> : <Play size={18} />}
          </button>
          <button
            onClick={handleReset}
            className="p-2 rounded-lg backdrop-blur bg-surface-3/80 text-gray-300"
          >
            <RotateCcw size={18} />
          </button>
        </div>

        {/* Speed control */}
        <div className="absolute bottom-4 right-4 flex items-center gap-2 bg-surface-2/80 backdrop-blur rounded-lg px-3 py-1.5">
          <span className="text-xs text-gray-400">Speed</span>
          {[0.25, 0.5, 1, 2, 4].map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={`px-2 py-0.5 rounded text-xs ${speed === s ? 'bg-brand-500/30 text-brand-400' : 'text-gray-500 hover:text-white'}`}
            >
              {s}x
            </button>
          ))}
        </div>
      </div>

      {/* Right panel */}
      <div className="w-72 bg-surface-1 border-l border-white/5 flex flex-col">
        <div className="p-3 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Simulation Controls</h2>
        </div>

        <div className="flex-1 overflow-auto p-3 space-y-3">
          {/* Policy */}
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-2">Policy</div>
            <button
              onClick={handleLoadPolicy}
              className="w-full px-3 py-1.5 bg-brand-500/20 text-brand-400 rounded text-sm hover:bg-brand-500/30"
            >
              <Upload size={14} className="inline mr-1.5" />
              Load Policy
            </button>
            {policyLoaded && (
              <div className="mt-2 text-xs text-green-400">Policy loaded</div>
            )}
          </div>

          {/* Interaction tools */}
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-2">Tools</div>
            <div className="grid grid-cols-3 gap-1">
              <button className="flex flex-col items-center p-2 rounded bg-surface-3 hover:bg-surface-4 text-gray-400 hover:text-white">
                <Target size={16} />
                <span className="text-[10px] mt-1">Target</span>
              </button>
              <button className="flex flex-col items-center p-2 rounded bg-surface-3 hover:bg-surface-4 text-gray-400 hover:text-white">
                <Box size={16} />
                <span className="text-[10px] mt-1">Obstacle</span>
              </button>
              <button className="flex flex-col items-center p-2 rounded bg-surface-3 hover:bg-surface-4 text-gray-400 hover:text-white">
                <Mountain size={16} />
                <span className="text-[10px] mt-1">Terrain</span>
              </button>
            </div>
          </div>

          {/* Telemetry */}
          <div className="bg-surface-2 rounded-lg p-3">
            <div className="text-xs text-gray-500 mb-2">Telemetry</div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Reward</span>
                <span className="text-white font-mono">{telemetry.episodeReward.toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Episode Length</span>
                <span className="text-white font-mono">{telemetry.episodeLength}</span>
              </div>
            </div>
          </div>

          {/* Training */}
          <TrainingPanel />
        </div>
      </div>
    </div>
  )
}

function createDuckRobot(): THREE.Group {
  const group = new THREE.Group()

  // Body (pelvis)
  const bodyGeo = new THREE.BoxGeometry(0.3, 0.15, 0.2)
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.4, metalness: 0.2 })
  const body = new THREE.Mesh(bodyGeo, bodyMat)
  body.castShadow = true
  group.add(body)

  // Head
  const headGeo = new THREE.SphereGeometry(0.1, 16, 16)
  const headMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d, roughness: 0.3 })
  const head = new THREE.Mesh(headGeo, headMat)
  head.position.set(0.15, 0.12, 0)
  head.castShadow = true
  group.add(head)

  // Beak
  const beakGeo = new THREE.ConeGeometry(0.04, 0.08, 8)
  const beakMat = new THREE.MeshStandardMaterial({ color: 0xf97316 })
  const beak = new THREE.Mesh(beakGeo, beakMat)
  beak.position.set(0.26, 0.12, 0)
  beak.rotation.z = -Math.PI / 2
  group.add(beak)

  // Legs
  const legGeo = new THREE.BoxGeometry(0.04, 0.25, 0.04)
  const legMat = new THREE.MeshStandardMaterial({ color: 0xf97316 })

  const leftLeg = new THREE.Mesh(legGeo, legMat)
  leftLeg.position.set(-0.05, -0.2, 0.06)
  leftLeg.userData.isLeg = true
  leftLeg.castShadow = true
  group.add(leftLeg)

  const rightLeg = new THREE.Mesh(legGeo, legMat)
  rightLeg.position.set(-0.05, -0.2, -0.06)
  rightLeg.userData.isLeg = true
  rightLeg.castShadow = true
  group.add(rightLeg)

  // Feet
  const footGeo = new THREE.BoxGeometry(0.08, 0.02, 0.06)
  const footMat = new THREE.MeshStandardMaterial({ color: 0xf97316 })

  const leftFoot = new THREE.Mesh(footGeo, footMat)
  leftFoot.position.set(0.01, -0.33, 0.06)
  group.add(leftFoot)

  const rightFoot = new THREE.Mesh(footGeo, footMat)
  rightFoot.position.set(0.01, -0.33, -0.06)
  group.add(rightFoot)

  return group
}
