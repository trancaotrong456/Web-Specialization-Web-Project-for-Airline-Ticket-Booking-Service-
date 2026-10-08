import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../app/AuthProvider';

export function renderWithApp(ui, {
  initialEntries = ['/'],
  fetchImpl = window.fetch.bind(window),
} = {}) {
  return render(
    <AuthProvider fetchImpl={fetchImpl}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </AuthProvider>
  );
}
