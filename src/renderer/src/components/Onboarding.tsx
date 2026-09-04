import React, { useState } from 'react'
import { Monitor, Terminal, BookOpen, Bird, ArrowRight, X } from 'lucide-react'

const SLIDES = [
  {
    icon: Monitor,
    title: 'System Monitor',
    description: 'Real-time CPU, memory, and GPU telemetry with live charts. Keep an eye on what matters.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10'
  },
  {
    icon: Terminal,
    title: 'Python Environments',
    description: 'Manage conda and venv environments, install packages, and launch activated terminals — all in one place.',
    color: 'text-green-400',
    bg: 'bg-green-500/10'
  },
  {
    icon: BookOpen,
    title: 'Jupyter Notebooks',
    description: 'Launch Jupyter Lab directly inside Ducky. Browse, open, and run notebooks without leaving the app.',
    color: 'text-purple-400',
    bg: 'bg-purple-500/10'
  },
  {
    icon: Bird,
    title: 'MicroDuck Simulation',
    description: 'Train and visualize a bipedal duck robot in a physics simulation. Load policies, place targets, and watch it learn.',
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10'
  }
]

const ONBOARDING_KEY = 'ducky.onboarding.done'

interface OnboardingProps {
  onComplete: () => void
}

export function Onboarding({ onComplete }: OnboardingProps): React.ReactElement {
  const [step, setStep] = useState(0)

  const handleFinish = (): void => {
    try {
      localStorage.setItem(ONBOARDING_KEY, 'true')
    } catch {
      // localStorage may be unavailable
    }
    onComplete()
  }

  const handleSkip = (): void => {
    handleFinish()
  }

  const isLast = step === SLIDES.length - 1
  const slide = SLIDES[step]
  const Icon = slide.icon

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-surface-0/95 backdrop-blur-sm">
      <div className="w-full max-w-lg px-8">
        <div className="flex justify-end mb-4">
          <button
            onClick={handleSkip}
            className="p-1 text-gray-500 hover:text-white transition-colors"
            title="Skip"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex flex-col items-center text-center gap-6">
          <div className={`p-5 rounded-2xl ${slide.bg}`}>
            <Icon size={56} className={slide.color} />
          </div>

          <h1 className="text-2xl font-bold text-white">{slide.title}</h1>
          <p className="text-gray-400 leading-relaxed max-w-sm">{slide.description}</p>

          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all ${
                  i === step ? 'w-6 bg-brand-500' : 'w-1.5 bg-surface-4'
                }`}
              />
            ))}
          </div>

          <div className="flex gap-3 w-full max-w-xs">
            {step > 0 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex-1 px-4 py-2.5 bg-surface-3 hover:bg-surface-4 text-white rounded-lg transition-colors"
              >
                Back
              </button>
            )}
            <button
              onClick={() => (isLast ? handleFinish() : setStep(step + 1))}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-lg transition-colors"
            >
              {isLast ? 'Get Started' : 'Next'}
              {!isLast && <ArrowRight size={16} />}
            </button>
          </div>

          {step === 0 && (
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-300 transition-colors"
            >
              Skip tour
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function isOnboardingDone(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === 'true'
  } catch {
    return false
  }
}
