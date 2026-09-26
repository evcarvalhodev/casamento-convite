# Pode Abrir — como colocar no ar

Site estático (HTML puro, sem build) na **Vercel** + banco, login, fotos e funções no **Supabase** +
pagamento no **Mercado Pago** (Checkout Transparente: Pix + cartão) + e-mail pela **Resend**.
É o mesmo desenho do ViralFlow e do workshop do Vinicius, sem React.

## Mapa

| Rota | Arquivo | O que é |
|---|---|---|
| `/` | `site/index.html` | página de vendas (o convite roda de verdade dentro do celular) |
| `/checkout` | `site/checkout.html` | dados + 2 orderbumps + Brick do MP; Pix espera o pagamento sozinho |
| `/entrar` | `site/entrar.html` | login sem senha: digita o e-mail, recebe um link |
| `/criar` | `site/criar.html` | editor do casal (exige login) |
| `/painel` | `site/painel.html` | quem confirmou, filtros, baixar lista (exige login) |
| `/adm` | `site/adm.html` | painel ADM: vendas, pedidos, convites, reenviar acesso, liberar cortesia |
| `/<slug>` | `site/convite.html` | o convite (o `vercel.json` manda qualquer `/ana-e-pedro` pra cá) |
| `/convite` | `site/convite.html` | demonstração (usada no iframe da página de vendas) |

| Função (Supabase) | Faz |
|---|---|
| `criar-pagamento` | grava o pedido, cobra no MP pelo preço do SERVIDOR, entrega na hora se o cartão aprovar |
| `mp-webhook` | Pix aprovado → entrega. Estorno → tira o convite do ar |
| `enviar-acesso` | tela /entrar. Só manda link pra quem comprou (ou é ADM). Resposta sempre igual |
| `admin` | tudo do /adm; confere o e-mail do login contra `ADMIN_EMAILS` |
| `_shared/comum.ts` | **PREÇOS**, entrega (cria conta + convite + e-mail) e envio de e-mail |

**Entrega** = cria a conta do comprador, cria o convite dele com os bumps que comprou e manda
o e-mail com o link que já entra logado no editor. Uma trava no banco (`acesso_enviado_em`)
impede e-mail duplicado quando o cartão aprova e o webhook chega junto.

## Preço

Mora em **dois lugares** que precisam bater: `supabase/functions/_shared/comum.ts` (o que cobra)
e `site/js/config.js` (o que a página mostra) — mais os textos da `index.html`.
Subir preço: **site primeiro, função depois** (senão a página mostra um valor e cobra outro).

## Passo a passo (primeira vez)

### 1. Supabase
1. Criar projeto novo (região São Paulo).
2. SQL Editor → colar `supabase/schema.sql` inteiro → Run.
3. Authentication → URL Configuration:
   - Site URL: `https://podeabrir.com.br`
   - Redirect URLs: `https://podeabrir.com.br/**` (e o endereço da Vercel, pra testar)
4. Project Settings → API: copiar **URL** e **anon key** para `site/js/config.js`.

### 2. Resend (e-mail)
1. Adicionar o domínio `podeabrir.com.br` e colar os registros DNS no registro.br.
2. Criar uma API key.

### 3. Mercado Pago
1. Suas integrações → criar aplicação → credenciais de **produção**.
2. **Public Key** → `site/js/config.js`. **Access Token** → secret no Supabase.
3. Webhooks → Pagamentos → URL `https://<ref>.supabase.co/functions/v1/mp-webhook` → copiar a assinatura secreta.

### 4. Secrets das funções (Supabase → Edge Functions → Secrets)
```
MP_ACCESS_TOKEN=APP_USR-...
MP_WEBHOOK_SECRET=...
RESEND_API_KEY=re_...
EMAIL_FROM=Pode Abrir <acesso@podeabrir.com.br>
SITE_URL=https://podeabrir.com.br
ADMIN_EMAILS=evcarvalhodev@gmail.com
```

### 5. Deploy das funções
```bash
npm i supabase --no-save
./node_modules/.bin/supabase login            # ou SUPABASE_ACCESS_TOKEN
for f in criar-pagamento mp-webhook enviar-acesso admin; do
  ./node_modules/.bin/supabase functions deploy $f --no-verify-jwt --project-ref <ref>
done
```
`--no-verify-jwt` é de propósito: o comprador e o convidado não têm login. O `admin` confere o
login por dentro.

### 6. Vercel
Importar a pasta `site/` como projeto (Framework: Other, sem build). Ligar o domínio `podeabrir.com.br`.

### 7. Testar com dinheiro de verdade
1. Comprar no Pix com os 2 bumps → conferir **R$ 113,90** no QR Code.
2. A tela do Pix tem que virar "Pagamento aprovado" sozinha.
3. O e-mail chega → o link abre o editor logado.
4. Publicar → abrir `podeabrir.com.br/<slug>` no iPhone → confirmar presença → ver no `/painel`.
5. Entrar em `/entrar` com o e-mail do ADM → cai no `/adm` → a venda está lá.
6. Estornar pelo painel do MP → o convite sai do ar.

## Regras (herdadas do ViralFlow, cada uma já custou caro lá)
- Quem cobra é o servidor. A página nunca manda valor.
- E-mail é só `<p>` e link cru. Template bonito vai pra aba Promoções e a noiva não acha o acesso.
- Tabela que cresce: ordenar do mais novo pro mais velho (o Supabase corta em 1000 linhas sem avisar).
- Nunca engolir o `error` do Supabase.
