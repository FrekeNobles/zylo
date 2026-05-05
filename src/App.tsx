import { useStore } from './lib/store';
import AuthPage from './pages/AuthPage';
import AppPage from './pages/AppPage';

export default function App() {
  const accessToken = useStore((s) => s.accessToken);
  return accessToken ? <AppPage /> : <AuthPage />;
}
