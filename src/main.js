/* ==========================================================================
   Точка входа приложения.
   Порядок: стили → bootstrap.
   bootstrap сам разберётся с DOMContentLoaded.
   ========================================================================== */
import './ui/styles/main.css';
import { bootstrap } from './app/bootstrap.js';

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
