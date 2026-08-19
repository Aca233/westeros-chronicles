import React from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface MapErrorBoundaryProps {
  children: React.ReactNode
  resetKey: string | number
  onRetry: () => void
}

interface MapErrorBoundaryState {
  failed: boolean
}

export class MapErrorBoundary extends React.Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  state: MapErrorBoundaryState = { failed: false }

  static getDerivedStateFromError(): MapErrorBoundaryState {
    return { failed: true }
  }

  componentDidCatch(error: unknown): void {
    console.error('地图子树渲染失败', error)
  }

  componentDidUpdate(previous: MapErrorBoundaryProps): void {
    if (previous.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false })
    }
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="map-load-state map-boundary-error" role="alert">
        <AlertTriangle className="h-8 w-8 text-gold" aria-hidden="true" />
        <strong>地图画布暂时无法显示</strong>
        <span>正文与人物卷宗仍可使用，不会影响当前存档。</span>
        <button type="button" className="btn-ghost map-retry-button" onClick={this.props.onRetry}>
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
          重新载入地图
        </button>
      </div>
    )
  }
}
