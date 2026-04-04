export default function AuthLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-black px-4 py-12">
      {/* Subtle ambient glow */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-[250px] left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[#1D9BF0]/[0.06] blur-[150px]" />
        <div className="absolute -bottom-[200px] -left-[100px] h-[400px] w-[400px] rounded-full bg-[#7B61FF]/[0.04] blur-[130px]" />
      </div>

      <div className="relative z-10 w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-x-blue">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="9" cy="9" r="2" />
              <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
            </svg>
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            MediaGenerator
          </h1>
        </div>

        {children}
      </div>
    </div>
  )
}
