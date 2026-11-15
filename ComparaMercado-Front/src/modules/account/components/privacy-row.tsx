import { ShieldCheck } from "lucide-react";
import { Badge, IconTile } from "@/components/ui/primitives";
import { InfoRow } from "./info-row";

/**
 * Uma única linha para tudo sobre privacidade: o resumo fica na tela e o texto completo abre num
 * sheet (localização, dados guardados e direitos). `signedIn` só muda o que dizemos sobre os dados.
 */
export function PrivacyRow({ signedIn }: { signedIn: boolean }) {
  return (
    <InfoRow
      icon={<IconTile icon={ShieldCheck} tone="neutral" />}
      title="Privacidade e dados"
      summary="Sua localização, o que guardamos e seus direitos"
    >
      <section className="space-y-2">
        <h3 className="font-semibold">Sua localização</h3>
        <p>
          Usamos a sua posição para mostrar a distância até cada mercado e para ordenar do mais
          perto ao mais longe. Ela só é pedida quando você toca em{" "}
          <strong>Ordenar por distância</strong> ou usa a localização na comparação da lista.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>No mapa:</strong> a distância é calculada no seu aparelho. A posição não sai
            dele.
          </li>
          <li>
            <strong>Na comparação da lista:</strong> a posição vai junto da consulta para calcular a
            distância dos mercados, é descartada logo em seguida e nunca é gravada.
          </li>
          <li>
            <strong>Na Comunidade (“Perto de mim”):</strong> a posição vai junto da consulta para
            filtrar e ordenar por distância, é descartada logo em seguida e nunca é gravada.
          </li>
          <li>Não há histórico de onde você esteve.</li>
        </ul>
        <p className="text-muted-foreground">
          Você pode recusar ou desligar a permissão nas configurações do navegador, e tudo continua
          funcionando sem ela, só sem as distâncias.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Dados que guardamos</h3>
        {signedIn ? (
          <>
            <p>
              Guardamos o mínimo para a sua conta funcionar: o seu <strong>e-mail</strong> e a{" "}
              <strong>senha</strong> (que fica protegida e ilegível até para nós), o{" "}
              <strong>nome</strong> pelo qual quer ser chamado e a data em que você aceitou os
              termos. <strong>Cidade</strong> e <strong>telefone</strong> são opcionais e só ficam
              salvos se você os informar em <em>Meu perfil</em>.
            </p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Sua <strong>lista de compras</strong> (produtos e quantidades) fica guardada na sua
                conta para aparecer em todos os seus aparelhos. Só você a vê.
              </li>
              <li>
                Os preços que você enviar ficam associados à sua conta para evitar abuso. Eles
                aparecem para outras pessoas na Comunidade com o seu apelido público (ou um nome
                genérico, como “Colaborador #A1B2”), nunca com o seu nome, e-mail ou telefone.
              </li>
            </ul>
          </>
        ) : (
          <>
            <p>
              Você não está logado, então não guardamos <strong>nenhum dado seu</strong>. Consultar
              preços e montar listas não exige conta, e a sua lista de compras fica só neste
              aparelho.
            </p>
            <p className="text-muted-foreground">
              Se você criar uma conta para contribuir, guardaremos só o necessário: e-mail, nome e o
              aceite dos termos.
            </p>
          </>
        )}
      </section>

      {signedIn ? (
        <section className="space-y-2">
          <h3 className="flex items-center gap-2 font-semibold">
            Exportar ou excluir meus dados <Badge>Em breve</Badge>
          </h3>
          <p>
            Você poderá baixar uma cópia de tudo o que guardamos sobre você e apagar a sua conta e
            os dados ligados a ela, sem precisar pedir a ninguém.
          </p>
          <p className="text-muted-foreground">
            Esses recursos chegam antes do beta fechado. Até lá, escreva para o contato da política
            de privacidade e fazemos a cópia ou a exclusão por você.
          </p>
        </section>
      ) : null}
    </InfoRow>
  );
}
