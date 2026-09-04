import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: React.ReactNode
  fallback?: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info.componentStack)
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): React.ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
          <div className="p-4 rounded-full bg-red-500/10">
            <AlertTriangle size={48} className="text-red-400" />
          </div>
          <h2 className="text-xl font-semibold text-white">Something went wrong</h2>
          <p className="text-sm text-gray-400 max-w-md text-center">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-2 px-4 py-2 bg-surface-3 hover:bg-surface-4 text-white rounded-lg transition-colors"
          >
            <RotateCcw size={16} />
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
