import { Component, type ReactNode } from 'react'

/* Filet de sécurité : si un rendu React plante, on affiche un écran « Oups »
   avec un gros bouton de retour — jamais d'écran blanc pour une non-lectrice. */

interface Props { onReset: () => void; children: ReactNode }
interface State { crashed: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  componentDidCatch(error: unknown) {
    console.error('ErrorBoundary:', error)
  }

  render() {
    if (!this.state.crashed) return this.props.children
    return (
      <section className="screen active">
        <div className="modal" style={{ margin: 'auto' }}>
          <h2>Oups ! 🐮</h2>
          <p>La ferme a eu un petit pépin… On recommence ?</p>
          <div className="rbtns">
            <button className="bigbtn primary"
              onClick={() => { this.setState({ crashed: false }); this.props.onReset() }}>
              🏠 Retour à la ferme
            </button>
          </div>
        </div>
      </section>
    )
  }
}
