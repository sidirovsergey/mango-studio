import { notFound } from 'next/navigation';
import { LoginForm } from './LoginForm';

export default function LoginPage() {
  if (process.env.NEXT_PUBLIC_AUTH_UI_ENABLED !== 'true') {
    notFound();
  }
  return (
    <div className="login-shell">
      <div className="login-aurora" aria-hidden="true">
        <span className="login-aurora-blob login-aurora-blob-a" />
        <span className="login-aurora-blob login-aurora-blob-b" />
      </div>
      <main className="login-page">
        <span className="login-eyebrow">
          <span className="login-eyebrow-dot" aria-hidden="true" />
          Одним кодом — без паролей
        </span>
        <h1 className="login-headline">
          Войти в <em>Mango Studio</em>
        </h1>
        <p className="login-subtitle">
          Введите email — пришлём короткий код. Ваш текущий проект сохранится.
        </p>
        <LoginForm />
      </main>
    </div>
  );
}
