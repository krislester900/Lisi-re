import React, { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = 'Une erreur inattendue est survenue.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string };
      if (parsed && parsed.error) {
        if (parsed.error.includes('Quota exceeded')) {
          readable =
            'Le quota quotidien de lecture ou d’écriture Firestore a été atteint. Il sera réinitialisé demain.';
        } else if (parsed.error.includes('Missing or insufficient permissions')) {
          readable =
            'Accès refusé par les règles de sécurité. Vérifiez que vous êtes bien connecté avec votre compte vérifié.';
        } else {
          readable = parsed.error;
        }
      }
    } catch {
      if (error.message) {
        readable = error.message;
      }
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Erreur capturée par ErrorBoundary:', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FBF9F5] dark:bg-stone-950 flex items-center justify-center px-6 py-16">
          <div className="max-w-lg w-full bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 rounded-lg p-8">
            <p className="text-xs uppercase tracking-widest text-stone-500 dark:text-stone-400 mb-3">
              Interruption momentanée
            </p>
            <h1 className="font-display text-2xl font-medium text-stone-900 dark:text-stone-100 mb-3">
              La page n’a pas pu charger cet échange
            </h1>
            <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed mb-6">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 text-sm font-medium text-white bg-[#1E3A8A] dark:bg-[#2C4F82] rounded-md hover:bg-[#172D6B] dark:hover:bg-[#3A639E] transition-colors whitespace-nowrap"
            >
              Recharger l’espace
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
