export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto grid min-h-screen max-w-6xl gap-6 px-3 py-5 md:grid-cols-2 md:items-center md:gap-7 md:px-5">
      <section aria-labelledby="pitch" className="max-w-prose">
        <p className="font-heading text-2xl font-semibold text-primary">AccessBridge</p>
        <h1 id="pitch" className="mt-4 text-4xl font-semibold text-balance md:text-5xl">
          The lecture, made readable. The paperwork, handled.
        </h1>
        <p className="mt-4 text-lg">
          Upload a recording. Get study material shaped to how you learn, then let
          AccessBridge write the accommodation request your professor will actually take
          seriously.
        </p>

        <figure className="mt-5 rounded-lg border border-border bg-surface p-4">
          <figcaption className="font-bold">What the dense version becomes</figcaption>
          <p className="mt-2 text-ink/70 line-through decoration-error decoration-2">
            Heteroscedasticity, wherein the variance of residuals is non-constant across
            levels of the predictor, violates the homoscedasticity assumption of ordinary
            least squares.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-4">
            <li>Residuals are the gaps between predictions and reality.</li>
            <li>Heteroscedasticity: those gaps change size as the predictor grows.</li>
            <li>Ordinary least squares assumes the gaps stay the same size.</li>
          </ul>
        </figure>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 md:p-5">
        {children}
      </section>
    </main>
  );
}
