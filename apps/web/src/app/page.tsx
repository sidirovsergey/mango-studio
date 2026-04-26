export default function HomePage() {
  return (
    <main className="min-h-screen p-10 flex flex-col gap-6">
      <h1 className="font-display text-4xl text-ink-900">
        Mango Studio · token sanity check
      </h1>
      <p className="font-sans text-ink-700">
        Если шрифты, цвета, glass и easing работают — фундамент Phase 0.3 готов.
      </p>
      <div className="flex flex-wrap gap-4">
        <div className="glass p-6 rounded-card">
          <code className="font-mono text-sm">.glass</code> — backdrop-filter blur(10px)
        </div>
        <div className="glass-frame p-6 rounded-card">
          <code className="font-mono text-sm">.glass-frame</code> — saturate(140%) blur(20px)
        </div>
        <div className="bg-mango-500 text-cream p-6 rounded-card">
          <code className="font-mono text-sm">bg-mango-500</code> · accent surface
        </div>
        <div className="bg-leaf-400 text-cream p-6 rounded-card">
          <code className="font-mono text-sm">bg-leaf-400</code> · secondary
        </div>
      </div>
      <button
        type="button"
        className="self-start px-6 py-3 bg-ink-900 text-cream rounded-pill transition-transform duration-300 ease-spring-soft hover:scale-105"
      >
        Hover me — spring-soft easing
      </button>
      <div className="font-serif text-2xl text-ink-700">
        Fraunces serif для акцентов
      </div>
    </main>
  );
}
