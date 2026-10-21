import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App';
import {StudioMotion} from './StudioMotion';
import './style.css';

createRoot(document.getElementById('root')!).render(<StrictMode><StudioMotion><App/></StudioMotion></StrictMode>);
