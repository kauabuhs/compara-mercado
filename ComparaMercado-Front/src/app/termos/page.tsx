import type { Metadata } from "next";
import { LegalPage } from "@/components/shared/legal-page";

export const metadata: Metadata = { title: "Termos de Uso" };

// TODO(revisão jurídica): texto inicial escrito pela equipe de produto. Precisa de revisão de um
// advogado antes do lançamento público. Ao alterar o conteúdo de forma relevante, suba
// `TERMS_VERSION` em `src/lib/legal.ts`.
export default function TermsPage() {
  return (
    <LegalPage title="Termos de Uso">
      <section>
        <h2>O que é o Compara Mercado</h2>
        <p>
          O Compara Mercado ajuda você a descobrir em qual mercado da sua cidade a sua lista de
          compras sai mais barata. Os preços mostrados vêm de pessoas e de equipes que fotografam
          etiquetas e de lançamentos feitos pela nossa equipe. Eles podem mudar a qualquer momento:
          confirme o valor no mercado antes de comprar.
        </p>
      </section>
      <section>
        <h2>Sua conta</h2>
        <ul>
          <li>Consultar preços e montar listas não exige conta.</li>
          <li>
            Para enviar preços, é preciso criar uma conta com um e-mail seu, que você controla.
          </li>
          <li>
            Você é responsável por manter a senha em segredo e por tudo o que é feito na conta.
          </li>
          <li>Podemos suspender contas usadas para abuso, fraude ou envio de dados falsos.</li>
        </ul>
      </section>
      <section>
        <h2>Preços e fotos que você envia</h2>
        <ul>
          <li>Envie só fotos de etiquetas de preço, sem pessoas, documentos ou dados pessoais.</li>
          <li>
            Você garante que a foto é sua e nos autoriza a usá-la para conferir e publicar o preço.
          </li>
          <li>
            Seu envio aparece na Comunidade como “não confirmado” e passa a confirmado quando outras
            pessoas o confirmam ou a equipe o aprova. Envios contestados ou denunciados podem ser
            retirados.
          </li>
          <li>Não é permitido enviar preços inventados ou fotos de outras pessoas.</li>
        </ul>
      </section>
      <section>
        <h2>Limites do serviço</h2>
        <p>
          Fazemos o possível para manter os preços atualizados, mas não garantimos que estejam
          corretos nem que o serviço fique sempre disponível. Não somos responsáveis por diferenças
          entre o preço mostrado e o preço cobrado pelo mercado.
        </p>
      </section>
      <section>
        <h2>Mudanças nestes termos</h2>
        <p>
          Se mudarmos estes termos de forma relevante, publicamos uma nova versão aqui e avisamos
          quem tem conta. A versão que você aceitou fica registrada na sua conta.
        </p>
      </section>
    </LegalPage>
  );
}
