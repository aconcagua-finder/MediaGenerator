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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.webp"
            alt="MediaGenerator"
            width={56}
            height={56}
            className="size-14 rounded-2xl"
          />
          <h1 className="text-xl font-bold tracking-tight text-white">
            MediaGenerator
          </h1>
        </div>

        {children}
      </div>
    </div>
  )
}
