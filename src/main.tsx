import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { db } from './db/database';
import { StartupError } from './shared/StartupError';

const root = createRoot(document.getElementById('root')!);

// 저장소를 먼저 연다. 못 열면(시크릿 창, 저장 차단 등) 빈 화면 대신 이유를 보여 준다.
db.open().then(
  () =>
    root.render(
      <StrictMode>
        <App />
      </StrictMode>,
    ),
  (error: unknown) => root.render(<StartupError error={error} />),
);
