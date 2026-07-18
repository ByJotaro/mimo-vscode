import { render } from 'solid-js/web';
import App from './App';
import { Background } from './components/Background';
import { OpenCodeProvider } from './hooks/useOpenCode';
import { SyncProvider } from './state/sync';
import './App.css';

try {
  render(
    () => (
      <>
        <Background />
        <OpenCodeProvider>
          <SyncProvider>
            <App />
          </SyncProvider>
        </OpenCodeProvider>
      </>
    ),
    document.getElementById('root')!
  );
} catch (error) {
  console.error('[OpenCode] Error rendering webview:', error);
}
