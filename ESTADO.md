# ESTADO — Convite de casamento interativo (low ticket)

> Última atualização: **26/09/2026 (noite)**. Comece por aqui.

## ⚡ Situação em 26/09 à noite
- **No ar:** https://podeabrir.goupwin.com (CNAME `podeabrir` → Vercel na zona DNS da Hostinger de goupwin.com). O `casamento-convite-cyan.vercel.app` continua funcionando.
- **Pagamento:** Mercado Pago da **Vitória** (app "Pode Abrir", id 4385112092323933, API de Payments). Webhook de produção configurado e PROVADO: compra real no Pix de R$1,00 foi aprovada pelo webhook e caiu no /parabens (pedido MP 181077250872).
- Preço real no ar desde 26/09 à noite: R$67 / R$27 / R$19,90 (o teste de R$0,50 já saiu).
- Pixel CONVITE_CASAMENTO (1445645484133103) + API de Conversões (Purchase pelo servidor, token só desse pixel).
- **Acesso igual ViralFlow:** pagar não cria conta; conta nasce no /parabens (e-mail da compra) ou no ADM. Painel é a tela inicial do casal. App instalável no painel.
- **E-mail:** Resend da conta evcarvalhodev (a mesma do ViralFlow), domínio `podeabrir.goupwin.com` verificado (TXT resend._domainkey.podeabrir + CNAMEs rsend/send.podeabrir na Hostinger). Chave `pode-abrir` só envio e só desse domínio. Remetente: Pode Abrir <acesso@podeabrir.goupwin.com>.
- **ADM:** a Vitória usa a mesma conta evcarvalhodev@gmail.com.
- **Falta:** página de privacidade/termos, foto real de casal na demo, criativo e campanha.
- **Segurança:** revogar o token do Supabase usado nesta sessão e trocar a senha do ADM (ficaram no chat).

## O produto
Convite digital interativo: o convidado abre o link do WhatsApp, vê um envelope com o nome dele,
toca, o envelope abre (pétalas + música) e aparece o convite: foto do casal, contagem regressiva,
cerimônia e recepção com "Como chegar", traje com paleta, salvar na agenda e confirmação de presença.
O casal preenche um formulário, sobe 1-3 fotos, escolhe o modelo e recebe o link. Painel mostra quem confirmou.

**Preço:** R$67 pagamento único. Bumps (só depois do principal vender): padrinhos R$27, manual dos padrinhos R$19. Upsell mapa de mesas R$47.
**Sem custo de IA** por convite (nada de gerar imagem). Sem mensalidade.

## Decisões travadas
- Não é lista de presentes (descartado no dia 25/09).
- 3 modelos no lançamento: clássico, rústico, moderno. Mesma estrutura, só muda a paleta/fonte.
- Link personalizado por convidado: `/ana-e-pedro?para=Maria` (o nome aparece no envelope).
- Fontes (26/09): sem letra cursiva, pediu mais legível e moderno. Clássico = Instrument Serif, Rústico = Fraunces, Moderno = Bodoni Moda (fundo preto). Texto corrido em Manrope.
- Efeitos de rolagem com GSAP: foto se revela, nomes sobem letra a letra, faixa correndo, dias contam de 0, história acende palavra por palavra, cartões sobem, paleta salta. Envelope NÃO flutua (tremia no PC).
- **Nome: Pode Abrir** (podeabrir.com.br), decidido 26/09 pelo critério FHC (fácil, hype, chiclete). "Convite Vivo" foi descartado: já existe convitevivo.com.br vendendo o MESMO produto a R$97 (concorrente direto, e prova de que o mercado paga). O nome não amarra a casamento: depois pode virar 15 anos, chá revelação, bodas.

## Pronto
- [x] `site/convite.html` — o convite (envelope + página + RSVP). Serve de prévia do editor via postMessage (`?previa`).
- [x] Prévia no iPhone: https://claude.ai/artifact/KFoyMU5bDmJP41AejdtGmc (o "Salvar na agenda" não funciona dentro da prévia; no site funciona)

- [x] `site/criar.html` — editor do casal em 6 passos (modelo, vocês, fotos, locais, detalhes, link) + tela final com link, WhatsApp e links por convidado. Recorte 3:4 com pinça/zoom, filtro P&B/sépia, exporta JPEG 1080x1440 (~200 KB). Rascunho salvo no aparelho (localStorage + IndexedDB). Prévia ao vivo via iframe do `convite.html?previa`.
  Prévia: https://claude.ai/artifact/9ZUT9rnwvA7tX3sUEXcqX4 — o "Publicar" é SIMULADO (window.API é stub até o Supabase existir).
- Música: ainda não tem campo no editor (decidir: upload de mp3 ou lista de músicas livres).

- [x] Venda + sistema (26/09), tudo em HTML puro + Supabase, replicando o ViralFlow/checkout do Vinicius:
  `index.html` (vendas, convite rodando dentro do celular), `checkout.html` (MP Pix+cartão, 2 bumps, Pix vira "aprovado" sozinho),
  `entrar.html` (login sem senha, link no e-mail), `painel.html` (confirmações, filtro, baixar CSV), `adm.html` (vendas, pedidos, convites, reenviar acesso, cortesia, tirar do ar).
  `supabase/schema.sql` + funções `criar-pagamento`, `mp-webhook`, `enviar-acesso`, `admin` (tipos conferidos com deno check). Passo a passo no `README.md`.
  NADA disso rodou contra um Supabase de verdade ainda — só a interface em modo demonstração.
- Orderbumps decididos (26/09): **Convite dos Padrinhos +R$27** e **Presentes no Pix +R$19,90**. Total com os dois: R$113,90.
  Tirei do checkout um "de R$47" riscado e um selo "mais pedido": nunca vendeu a R$47 e ainda não vendeu nada — seria propaganda enganosa.
- Fotos e respostas somem 60 dias depois do casamento (`expira_em`). O convite sai do ar sozinho; a LIMPEZA dos arquivos ainda não existe (ver Falta).

## Falta — em ordem
1. Ele: registrar podeabrir.com.br, criar o projeto no Supabase, conta na Resend (DNS), credenciais de produção do MP.
2. Eu: preencher `site/js/config.js`, secrets, deploy das funções, Vercel. Depois o teste com dinheiro de verdade do README (passo 7).
3. **Construir os 2 bumps ANTES do tráfego** (hoje eles são vendidos e gravados em `convites.recursos`, mas não existem na tela):
   - Padrinhos: variação do convite ("Quer ser nosso padrinho?") + links por padrinho + resposta no painel.
   - Pix: campo de chave Pix no editor + seção no convite com QR Code (BR Code estático gerado no navegador).
4. Limpeza automática: função agendada que apaga fotos e confirmações de convites com `expira_em` vencido.
5. Pixel da Meta (Purchase no `aprovado()` do checkout — já tem o lugar comentado).
6. Vídeo de tela do envelope abrindo no iPhone = criativo.
7. Música no convite (decidir: lista de faixas livres ou upload).

## 27/09/2026 — página v2 no ar
- Página de vendas reescrita no formato Brunson (convite + controle de convidados, conta do buffet, 3 dúvidas, oferta empilhada, Garantia Pode Abrir, quando mandar). Aprovada por ele na prévia.
- Demonstração: foto por modelo (`img/demo-casal` clássico, `demo-rustico`, `demo-moderno`) + galeria "Nós dois" (`demo-cafe`, `demo-anel`). Fotos geradas por IA, JPEG q82.
- Próximo possível: oferta de 1 clique depois da compra (OTO); página de privacidade/termos.
