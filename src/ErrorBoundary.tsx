import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="bg-white p-8 rounded-[40px] shadow-xl border border-slate-100 text-center max-w-sm">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-6 text-2xl font-black">
              !
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2 uppercase">Algo ha fallado</h2>
            <p className="text-slate-500 font-medium mb-8 text-sm">
              La aplicación ha encontrado un error inesperado. Recarga la página para continuar.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest"
            >
              Recargar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
