import { useI18n } from '../../i18n/i18n'

export function HowItWorksPage() {
  const { tr } = useI18n()
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">{tr({ en: 'How it works', pt: 'Como funciona' })}</h1>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-800">
          <li>
            {tr({
              en: 'Install the app to your home screen (iPhone or Android).',
              pt: 'Instale o app na tela inicial (iPhone ou Android).',
            })}
          </li>
          <li>{tr({ en: 'Log in and register for an event.', pt: 'Faça login e se inscreva em um evento.' })}</li>
          <li>
            {tr({
              en: 'On race day, staff checks you in and assigns your bib.',
              pt: 'No dia da prova, a equipe faz seu check-in e atribui seu Bib.',
            })}
          </li>
          <li>
            {tr({
              en: 'You scan your Bib QR to download today’s race package (route stages + checkpoint rules) for offline race mode.',
              pt: 'Você escaneia o Bib QR para baixar o pacote de prova do dia (etapas da rota + regras de Checkpoints) para uso offline.',
            })}
          </li>
          <li>
            {tr({
              en: 'In Race Mode, scan the Start QR to begin timing.',
              pt: 'No Race Mode, escaneie o Start QR para iniciar a cronometragem.',
            })}
          </li>
          <li>
            {tr({
              en: 'Scan checkpoint QRs in the required order. The app enforces your assigned route (anchors + blocks) even if you are offline.',
              pt: 'Escaneie os QR codes de Checkpoint na ordem exigida. O app aplica a sua rota atribuída (anchors + blocks) mesmo offline.',
            })}
          </li>
          <li>
            {tr({
              en: 'Scan the Finish QR to request finish validation.',
              pt: 'Escaneie o Finish QR para solicitar a validação da chegada.',
            })}
          </li>
          <li>
            {tr({
              en: 'Results appear as provisional first, then become official after server-side validation of your full scan log.',
              pt: 'Os resultados aparecem primeiro como provisional e depois viram official após a validação no servidor do seu log completo de scans.',
            })}
          </li>
        </ol>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">{tr({ en: 'Race integrity', pt: 'Integridade da prova' })}</h2>
        <p className="mt-2 text-sm text-zinc-800">
          {tr({
            en: 'The app records both valid and invalid scans for audit. A finish is not official unless all required checkpoints/blocks were completed in the correct sequence.',
            pt: 'O app registra scans válidos e inválidos para auditoria. Uma chegada não é official se todos os Checkpoints/blocks obrigatórios não forem concluídos na sequência correta.',
          })}
        </p>
      </section>
    </div>
  )
}
