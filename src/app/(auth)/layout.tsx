export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-[oklch(0.10_0_0)]">
      {/* Ambient background glow blobs */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full opacity-20 blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.60 0.20 280), transparent 70%)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-32 -right-16 h-80 w-80 rounded-full opacity-15 blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.65 0.22 200), transparent 70%)" }}
      />

      {/* Left branding panel — hidden on mobile */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col items-center justify-center overflow-hidden px-12">
        {/* Panel background */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(135deg, oklch(0.18 0.04 280) 0%, oklch(0.13 0.02 260) 50%, oklch(0.16 0.05 200) 100%)",
          }}
        />

        {/* Grid pattern overlay */}
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `
              linear-gradient(oklch(1 0 0) 1px, transparent 1px),
              linear-gradient(90deg, oklch(1 0 0) 1px, transparent 1px)
            `,
            backgroundSize: "40px 40px",
          }}
        />

        {/* Accent ring decoration */}
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[500px] w-[500px] rounded-full border opacity-10"
          style={{ borderColor: "oklch(0.75 0.18 280)" }}
        />
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[700px] w-[700px] rounded-full border opacity-5"
          style={{ borderColor: "oklch(0.75 0.18 280)" }}
        />

        {/* Glowing orb */}
        <div
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-48 w-48 rounded-full opacity-30 blur-2xl"
          style={{ background: "oklch(0.65 0.22 280)" }}
        />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Logo mark */}
          <div
            className="mb-8 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{
              background: "linear-gradient(135deg, oklch(0.65 0.22 280), oklch(0.70 0.20 200))",
              boxShadow: "0 0 40px oklch(0.65 0.22 280 / 40%)",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden>
              <path
                d="M4 24L12 12L18 18L22 14L28 24H4Z"
                fill="none"
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <circle cx="22" cy="10" r="3" fill="white" fillOpacity="0.9" />
            </svg>
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-white mb-3">
            MediaGenerator
          </h1>

          <p className="text-lg leading-relaxed max-w-xs" style={{ color: "oklch(0.75 0 0)" }}>
            Создавайте уникальные изображения с помощью нейросетей
          </p>

          {/* Feature pills */}
          <div className="mt-10 flex flex-col gap-3 w-full max-w-xs">
            {[
              { icon: "✦", text: "Несколько AI-провайдеров" },
              { icon: "◈", text: "Библиотека и история генераций" },
              { icon: "⬡", text: "Быстрая загрузка результатов" },
            ].map((item) => (
              <div
                key={item.text}
                className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
                style={{
                  background: "oklch(1 0 0 / 5%)",
                  border: "1px solid oklch(1 0 0 / 8%)",
                  color: "oklch(0.82 0 0)",
                }}
              >
                <span style={{ color: "oklch(0.72 0.18 280)" }}>{item.icon}</span>
                {item.text}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="flex w-full lg:w-1/2 flex-col items-center justify-center px-6 py-12 lg:px-16">
        {/* Mobile-only branding */}
        <div className="mb-8 flex flex-col items-center lg:hidden">
          <div
            className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
            style={{
              background: "linear-gradient(135deg, oklch(0.65 0.22 280), oklch(0.70 0.20 200))",
            }}
          >
            <svg width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden>
              <path
                d="M4 24L12 12L18 18L22 14L28 24H4Z"
                fill="none"
                stroke="white"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <circle cx="22" cy="10" r="3" fill="white" fillOpacity="0.9" />
            </svg>
          </div>
          <span className="text-xl font-bold text-white">MediaGenerator</span>
        </div>

        <div className="w-full max-w-sm">{children}</div>
      </div>
    </div>
  )
}
