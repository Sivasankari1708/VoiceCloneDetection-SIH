import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { DemoScenarioProvider } from './context/DemoScenarioContext';
import AppRoutes from './routes';
import './index.css';

export default function App() {
  return (
    <BrowserRouter>
      <AppProvider>
        <DemoScenarioProvider>
          <AppRoutes />
        </DemoScenarioProvider>
      </AppProvider>
    </BrowserRouter>
  );
}
