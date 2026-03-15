export function HowItWorksPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h1 className="text-2xl font-bold">Como funciona</h1>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-zinc-800">
          <li>Instale o app na tela inicial (iPhone ou Android).</li>
          <li>Faça login e se inscreva em um evento.</li>
          <li>No dia da prova, a equipe faz seu check-in e atribui seu Bib.</li>
          <li>
            Você escaneia o Bib QR para baixar o pacote de prova do dia (etapas da rota + regras de Checkpoints) para
            uso offline.
          </li>
          <li>No Race Mode, escaneie o Start QR para iniciar a cronometragem.</li>
          <li>
            Escaneie os QR codes de Checkpoint na ordem exigida. O app aplica a sua rota atribuída (anchors + blocks)
            mesmo offline.
          </li>
          <li>Escaneie o Finish QR para solicitar a validação da chegada.</li>
          <li>
            Os resultados aparecem primeiro como <span className="font-semibold">provisional</span> e depois viram{' '}
            <span className="font-semibold">official</span> após a validação no servidor do seu log completo de scans.
          </li>
        </ol>
      </section>

      <section className="rounded-lg border border-zinc-200 bg-white p-5">
        <h2 className="text-lg font-bold">Integridade da prova</h2>
        <p className="mt-2 text-sm text-zinc-800">
          O app registra scans <span className="font-semibold">válidos e inválidos</span> para auditoria. Uma chegada não
          é official se todos os Checkpoints/blocks obrigatórios não forem concluídos na sequência correta.
        </p>
      </section>
    </div>
  )
}
