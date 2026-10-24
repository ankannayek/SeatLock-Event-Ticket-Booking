import { Component } from 'react'

// Catches render errors so a bad response never leaves a blank white page.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error) {
    console.error('SeatLock render error:', error)
  }

  componentDidUpdate(prev) {
    // Leaving the broken page clears the error.
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null })
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="empty" role="alert">
        <h2>Something went wrong</h2>
        <p>This page hit a problem. Your seats and tickets are safe.</p>
        <button type="button" className="btn" onClick={() => this.setState({ error: null })}>Try again</button>
        <button type="button" className="link-btn" onClick={() => window.location.reload()}>Reload the page</button>
        <details className="err-details" open>
          <summary>Error details (send this to the developer)</summary>
          <pre>{String(this.state.error?.stack || this.state.error?.message || this.state.error)}</pre>
        </details>
      </div>
    )
  }
}
