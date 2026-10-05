import { AppRouter } from './AppRouter';
import { AuthProvider } from './AuthProvider';

export function App() {
  return (
    <AuthProvider>
      <AppRouter />
    </AuthProvider>
  );
}
