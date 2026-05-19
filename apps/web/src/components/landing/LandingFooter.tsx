export function LandingFooter() {
  return (
    <footer className="landing-footer" style={styles.footer}>
      <div style={styles.line}>Mango Studio · ранний доступ</div>
      <nav style={styles.nav} aria-label="Юридическая информация">
        <a href="/legal/offer" style={styles.link}>
          Оферта
        </a>
        <span aria-hidden="true" style={styles.dot}>
          ·
        </span>
        <a href="/legal/privacy" style={styles.link}>
          Конфиденциальность
        </a>
      </nav>
    </footer>
  );
}

const styles = {
  footer: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 8,
    padding: '32px 16px 24px',
    color: '#736b5e',
    fontSize: 13,
    textAlign: 'center' as const,
  },
  line: {
    opacity: 0.85,
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap' as const,
    justifyContent: 'center',
  },
  link: {
    color: '#736b5e',
    textDecoration: 'underline',
    textUnderlineOffset: 3,
  },
  dot: {
    opacity: 0.5,
  },
};
