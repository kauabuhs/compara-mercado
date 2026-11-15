import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/shared/legal-page";

export const metadata: Metadata = { title: "Política de Privacidade" };

// TODO(revisão jurídica): texto inicial escrito pela equipe de produto, alinhado ao que o sistema
// realmente guarda (ver `profiles` e ADR-0009). Precisa de revisão de um advogado e da definição
// do canal de contato do encarregado (LGPD) antes do lançamento público.
export default function PrivacyPage() {
  return (
    <LegalPage title="Política de Privacidade">
      <section>
        <h2>O que guardamos</h2>
        <p>Só o necessário para o serviço funcionar:</p>
        <ul>
          <li>
            <strong>Sem conta:</strong> nada. Sua lista de compras fica só no seu aparelho e a sua
            localização nunca é gravada.
          </li>
          <li>
            <strong>Com conta:</strong> e-mail, senha (guardada de forma que nem nós conseguimos
            lê-la), o nome pelo qual quer ser chamado, a data e a versão dos termos que você
            aceitou.
          </li>
          <li>
            <strong>Sua lista de compras, se tiver conta:</strong> os produtos e as quantidades,
            para a lista aparecer em todos os seus aparelhos. Só você a vê, e ela some quando a
            conta for excluída.
          </li>
          <li>
            <strong>Se você informar:</strong> cidade, telefone e um apelido público (opcionais, em
            Meu perfil).
          </li>
          <li>
            <strong>Se você enviar preços:</strong> a foto da etiqueta (sem dados de localização
            embutidos na imagem) e o preço, ligados à sua conta para evitar abuso. O preço e a foto
            aparecem na Comunidade para outras pessoas, junto do seu apelido público (ou de um nome
            genérico, como “Colaborador #A1B2”, se você não escolher um). O seu nome, e-mail e
            telefone nunca aparecem. As confirmações e denúncias que você faz ficam registradas na
            sua conta, e os seus pontos de reputação aparecem como um nível.
          </li>
        </ul>
      </section>
      <section>
        <h2>Para que usamos</h2>
        <ul>
          <li>Entrar na sua conta e recuperar a senha por e-mail.</li>
          <li>Conferir e publicar os preços que você envia.</li>
          <li>Mostrar os preços da sua cidade primeiro, se você a informou.</li>
          <li>Proteger o serviço contra fraude e abuso.</li>
        </ul>
        <p>Não vendemos dados e não usamos o seu e-mail ou telefone para publicidade.</p>
      </section>
      <section>
        <h2>Seus direitos</h2>
        <p>
          Pela LGPD você pode confirmar que tratamos dados seus, corrigi-los (em{" "}
          <Link href="/conta/perfil" className="text-brand underline">
            Meu perfil
          </Link>
          ), pedir uma cópia, pedir a exclusão da conta e revogar o seu consentimento. Enquanto a
          exportação e a exclusão automáticas não chegam ao aplicativo, faça o pedido pelo contato
          do responsável abaixo.
        </p>
      </section>
      <section>
        <h2>Por quanto tempo guardamos</h2>
        <p>
          Os dados da conta ficam enquanto a conta existir. Ao excluí-la, apagamos os dados
          pessoais; os preços já publicados continuam, sem ligação com você.
        </p>
      </section>
      <section>
        <h2>Contato do responsável</h2>
        <p>
          O canal de contato do responsável pelo tratamento de dados será informado aqui antes do
          lançamento público.
        </p>
      </section>
    </LegalPage>
  );
}
