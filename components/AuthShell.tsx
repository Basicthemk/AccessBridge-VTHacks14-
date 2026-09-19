export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <main id="main" tabIndex={-1} className="mx-auto grid min-h-screen max-w-6xl content-start gap-5 px-3 py-6 md:grid-cols-12 md:gap-x-6 md:gap-y-5 md:px-5 md:py-7">
      <section aria-labelledby="pitch" className="md:col-span-7 md:row-start-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/lockup-transparent.svg" alt="AccessBridge" width={1040} height={220} className="h-7 w-auto max-w-full" />
        <h1 id="pitch" className="mt-5 max-w-prose text-4xl font-semibold text-balance md:text-5xl">
          The lecture, made readable. The paperwork, handled.
        </h1>
        <p className="mt-4 max-w-prose text-lg">
          Upload a recording. Get study material shaped to how you learn, then let
          AccessBridge write the accommodation request your professor will actually take
          seriously.
        </p>
      </section>

      <section className="sheet md:col-span-5 md:col-start-8 md:row-span-2 md:row-start-1 md:mt-6 md:self-start">
        {children}
      </section>

      {/* After the form on a phone, so the task comes first; under the pitch on a wide screen. */}
      <div className="md:col-span-7 md:col-start-1 md:row-start-2 md:self-start">
        <figure className="max-w-prose border-t border-border pt-4">
          <figcaption className="font-heading text-xl font-semibold">What the dense version becomes</figcaption>
          <p className="mt-3">
            <span className="sr-only">Before: </span>
            <del className="line-through decoration-error decoration-2">
              Heteroscedasticity, wherein the variance of residuals is non-constant across
              levels of the predictor, violates the homoscedasticity assumption of ordinary
              least squares.
            </del>
          </p>
          <ul aria-label="Plain-language version" className="mt-3 list-disc space-y-2 pl-4">
            <li>Residuals are the gaps between predictions and reality.</li>
            <li>Heteroscedasticity: those gaps change size as the predictor grows.</li>
            <li>Ordinary least squares assumes the gaps stay the same size.</li>
          </ul>
        </figure>
      </div>
    </main>
  );
}
