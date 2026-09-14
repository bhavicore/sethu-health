import { useEffect, useState } from 'react';
import './App.css';
import Landing from './views/Landing';
import PhcView from './views/PhcView';
import ChcView from './views/ChcView';
import SyncStatusBar from './components/SyncStatusBar';
import { initSyncEngine } from './lib/sync';

export default function App() {
  const [role, setRole] = useState(null);

  useEffect(() => {
    const stop = initSyncEngine();
    return stop;
  }, []);

  return (
    <div className="app">
      <nav className="app__nav">
        <button className="app__logo" onClick={() => setRole(null)}>
          SETHU
        </button>
        {role && (
          <div className="app__nav-links">
            <button
              className={role === 'phc' ? 'app__nav-link app__nav-link--active' : 'app__nav-link'}
              onClick={() => setRole('phc')}
            >
              PHC
            </button>
            <button
              className={role === 'chc' ? 'app__nav-link app__nav-link--active' : 'app__nav-link'}
              onClick={() => setRole('chc')}
            >
              CHC
            </button>
          </div>
        )}
        <SyncStatusBar />
      </nav>

      <main className="app__main">
        {!role && <Landing onSelect={setRole} />}
        {role === 'phc' && <PhcView />}
        {role === 'chc' && <ChcView />}
      </main>
    </div>
  );
}
