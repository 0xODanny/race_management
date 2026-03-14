export function HowItWorksPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">How it works</h1>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-800">
          <li>Install the app to your home screen (iPhone or Android).</li>
          <li>Log in and register for an event.</li>
          <li>On race day, staff checks you in and assigns your bib.</li>
          <li>
            You scan your Bib QR to download today’s race package (route stages + checkpoint rules) for offline race
            mode.
          </li>
          <li>In Race Mode, scan the Start QR to begin timing.</li>
          <li>
            Scan checkpoint QRs in the required order. The app enforces your assigned route (anchors + blocks) even if
            you are offline.
          </li>
          <li>Scan the Finish QR to request finish validation.</li>
          <li>
            Results appear as <span className="font-semibold">provisional</span> first, then become{' '}
            <span className="font-semibold">official</span> after server-side validation of your full scan log.
          </li>
        </ol>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">Race integrity</h2>
        <p className="mt-2 text-sm text-zinc-800">
          The app records <span className="font-semibold">both valid and invalid</span> scans for audit. A finish is not
          official unless all required checkpoints/blocks were completed in the correct sequence.
        </p>
      </section>
    </div>
  )
}
