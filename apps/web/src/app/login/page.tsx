import { notFound } from 'next/navigation';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  if (process.env.NEXT_PUBLIC_AUTH_UI_ENABLED !== 'true') {
    notFound();
  }
  return (
    <main className="login-page">
      <h1>Войти в Mango Studio</h1>
      <p className="login-subtitle">Email — никаких паролей. Получите код одной кнопкой.</p>
      <LoginForm />
    </main>
  );
}
