import { Component, type ReactNode } from 'react'
import { clearCache } from '../lib/api'

/** Если экран упал, показать кнопку восстановления вместо белого листа. */
export class Crash extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(e: Error) { return { error: e.message } }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="wrap"><div className="banner" role="alert">
        <p>Что-то сломалось при показе экрана: {this.state.error}</p>
        <button className="btn" onClick={() => { clearCache(); location.reload() }}>Сбросить кэш и перезапустить</button>
      </div></div>
    )
  }
}
