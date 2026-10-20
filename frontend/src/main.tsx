import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './style.css';

function App() {
  return (
    <main>
      <h1>MatchLens</h1>
      <p>Project environment ready.</p>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode><App /></StrictMode>,
);
