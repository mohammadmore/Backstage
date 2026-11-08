import React from 'react';
import ReactDOM from 'react-dom/client';
import 'vazirmatn/Vazirmatn-Variable-font-face.css';
import './index.css';
import App from './App';
import { AppErrorBoundary } from './components/ErrorBoundary';

ReactDOM.createRoot(document.getElementById('root')).render(<AppErrorBoundary><App /></AppErrorBoundary>);
