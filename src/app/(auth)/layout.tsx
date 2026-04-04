export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      {/* Faint top-edge glow — the only decorative element */}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 h-px opacity-40"
        style={{
          background:
            "linear-gradient(90deg, transparent 0%, oklch(0.7 0 0) 50%, transparent 100%)",
        }}
      />

      <div className="w-full max-w-[360px]">
        {/* Wordmark */}
        <div className="mb-10 text-center">
          <h1 className="text-lg font-medium tracking-tight text-foreground">
            MediaGenerator
          </h1>
        </div>

        {children}

        {/* Footer */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Генерация изображений с помощью нейросетей
        </p>
      </div>
    </div>
  )
}
