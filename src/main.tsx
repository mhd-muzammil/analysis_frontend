import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

window.onerror = function(msg, url, lineNo, columnNo) {
  alert('CRASH: ' + msg + '\nAt: ' + url + ':' + lineNo + ':' + columnNo);
  return false;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
