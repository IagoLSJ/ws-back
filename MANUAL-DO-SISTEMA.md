# Manual do Sistema Multi Negócio

## Sumário

1. [Introdução](#1-introdução)
2. [Níveis de Acesso](#2-níveis-de-acesso)
3. [Dashboard](#3-dashboard)
4. [PDV - Ponto de Venda](#4-pdv---ponto-de-venda)
5. [Caixa](#5-caixa)
6. [Catálogo (Vitrine)](#6-catálogo-vitrine)
7. [Produtos](#7-produtos)
8. [Categorias](#8-categorias)
9. [Combos](#9-combos)
10. [Pedidos](#10-pedidos)
11. [Cozinha](#11-cozinha)
12. [Estoque](#12-estoque)
13. [Mesas](#13-mesas)
14. [Clientes](#14-clientes)
15. [Contas a Receber](#15-contas-a-receber)
16. [WhatsApp](#16-whatsapp)
17. [Negócios](#17-negócios)
18. [Usuários](#18-usuários)
19. [Membros](#19-membros)
20. [Relatórios](#20-relatórios)
21. [Financeiro](#21-financeiro)
22. [Auditoria](#22-auditoria)
23. [Configurações do Negócio](#23-configurações-do-negócio)
24. [Atalhos de Teclado](#24-atalhos-de-teclado)

---

## 1. Introdução

O **Multi Negócio** (Walker Salgados) é um sistema de gestão multi-negócio que permite administrar um ou mais estabelecimentos (padaria, mercado, restaurante) em uma única plataforma.

### Funcionalidades principais

- **PDV** — Ponto de venda rápido com leitor de código de barras e balança
- **Gestão de estoque** — Controle de entrada, saída, transferência e alertas de ruptura
- **Catálogo online (vitrine)** — Clientes podem fazer pedidos pelo celular via QR Code da mesa
- **Gestão de pedidos** — Acompanhamento do status (cozinha, entrega)
- **Caixa** — Abertura, fechamento, sangria e suprimento
- **Financeiro** — Relatórios de faturamento, custos e margem
- **WhatsApp** — Chatbot para atendimento automático
- **Impressão térmica** — Comandas e cupons via QZ Tray, TCP/IP, USB ou Bluetooth

### Tecnologias

| Camada | Tecnologia |
|--------|-----------|
| Frontend | Vue 3, TypeScript, Vite |
| Backend | NestJS, Prisma |
| Banco | PostgreSQL |
| Cache | Redis |
| Fila | BullMQ |
| Storage | Supabase S3 |

---

## 2. Níveis de Acesso

O sistema possui 4 níveis hierárquicos:

| Role | Hierarquia | Acesso |
|------|-----------|--------|
| **SUPER_ADMIN** | 5 (maior) | Acesso total a todos os negócios. Gerencia usuários e negócios. |
| **GERENTE** | 4 | Gerencia produtos, categorias, combos, membros, configurações, relatórios. |
| **OPERADOR** | 3 | Opera o PDV, caixa, estoque, pedidos. Não gerencia configurações. |
| **VISUALIZADOR** | 1 | Apenas visualiza dados (relatórios, pedidos, estoque). |

### Regras por módulo

| Módulo | SUPER_ADMIN | GERENTE | OPERADOR | VISUALIZADOR |
|--------|:-----------:|:-------:|:--------:|:------------:|
| PDV | ✅ | ✅ | ✅ | ❌ |
| Caixa | ✅ | ✅ | ✅(próprio) | ❌ |
| Produtos | ✅ | ✅ | ❌ | ❌ |
| Categorias | ✅ | ✅ | ❌ | ✅(visualizar) |
| Combos | ✅ | ✅ | ✅(PDV) | ❌ |
| Pedidos | ✅ | ✅(status) | ✅(status) | ✅(visualizar) |
| Estoque | ✅ | ✅ | ✅(movimentar) | ❌ |
| Mesas | ✅ | ✅ | ✅(ocupar/liberar) | ❌ |
| Clientes | ✅ | ✅ | ✅ | ❌ |
| Contas a Receber | ✅ | ✅(baixa) | ❌(baixa) | ❌ |
| Configurações | ✅ | ✅ | ❌ | ❌ |
| Usuários | ✅ | ❌ | ❌ | ❌ |
| Negócios | ✅ | ❌ | ❌ | ❌ |
| Financeiro | ✅ | ✅ | ❌ | ❌ |
| Relatórios | ✅ | ✅ | ❌ | ❌ |
| Auditoria | ✅ | ✅ | ❌ | ❌ |

---

## 3. Dashboard

![Print: Tela do Dashboard com KPIs e gráficos](prints/dashboard.png)

**Acesso:** Todos os roles  
**Rota:** `/`

O Dashboard exibe um resumo do negócio com:

- **KPIs principais:** Faturamento do dia, mês, semana
- **Alertas de estoque:** Quantidade de produtos com ruptura (estoque ≤ 0)
- **Faturamento diário:** Gráfico dos últimos dias
- **Últimos pedidos:** Pedidos recentes

> O SUPER_ADMIN vê dados de todos os negócios. Os demais roles veem apenas do negócio selecionado.

---

## 4. PDV - Ponto de Venda

**Acesso:** OPERADOR, GERENTE, SUPER_ADMIN  
**Rota:** `/pdv` (tela cheia, sem sidebar)

### Visão Geral

O PDV é a tela principal de vendas. Possui:

1. **Barra de status** — Leitor, balança, impressora, caixa, horário
2. **Campo de busca inteligente** — Busca por nome, código de barras ou PLU
3. **Carrinho** — Itens adicionados com quantidades e descontos
4. **Tela inativa** — Quando o carrinho está vazio, mostra o relógio e logotipo

### Como usar

#### Adicionar produtos
- **Código de barras:** Passe o produto no leitor — ele é adicionado automaticamente
- **Busca manual:** Digite o nome e pressione Enter — use `*` para quantidade (ex: `coca * 5`)
- **Busca (F2):** Abre a janela de busca com categorias e combos

#### Produtos por peso
- Ao adicionar um produto com `vendaPorPeso`, abre o modal para digitar o peso
- A balança conectada preenche automaticamente

#### Modificadores
- Produtos com modificadores (grupos de opções) abrem um modal para seleção
- É obrigatório selecionar opções marcadas com `*`

#### Descontos
- **Por item:** Clique no item do carrinho e defina desconto percentual ou fixo
- **Total:** Defina um desconto geral na tela de checkout

#### Finalizar venda (F8)

1. **Forma de pagamento:**
   - `1` — Dinheiro
   - `2` — Cartão Crédito
   - `3` — Cartão Débito
   - `4` — PIX
   - `5` — Crediário (cliente)
2. Informe o valor pago (para dinheiro, calcula o troco)
3. Selecione **imprimir comanda** e/ou **imprimir cupom**
4. Confirme

> **Atenção:** O caixa precisa estar aberto para finalizar vendas.

#### Atalhos

| Tecla | Ação |
|-------|------|
| `F2` | Abrir busca de produtos |
| `F8` | Finalizar venda |
| `Esc` | Fechar modal / limpar busca |
| `Del` | Limpar carrinho |
| `F11` | Alternar tela cheia |
| `1-5` | Selecionar forma de pagamento |

---

## 5. Caixa

![Print: Tela do Caixa com resumo e movimentações](prints/caixa.png)

![Print: Modal de fechamento de caixa](prints/caixa-fechar.png)

**Acesso:** OPERADOR, GERENTE, SUPER_ADMIN  
**Rota:** `/caixa`

### Funcionalidades

| Ação | Descrição | Quem pode |
|------|-----------|-----------|
| **Abrir Caixa** | Inicia o expediente com saldo inicial | GERENTE |
| **Sangria** | Retirada de valor do caixa | OPERADOR |
| **Suprimento** | Acrescenta valor ao caixa | OPERADOR |
| **Fechar Caixa** | Encerra o expediente, confere valores | GERENTE |

### Fluxo

1. **Abrir caixa:** Informe o saldo inicial (troco) e opcionalmente o operador
2. **Vender no PDV:** As vendas são registradas automaticamente no caixa
3. **Sangria/Suprimento:** Registre retiradas ou acréscimos durante o expediente
4. **Fechar caixa:** O sistema calcula o saldo esperado, confira com o dinheiro físico e feche

> O saldo esperado é: `saldoInicial + vendas + suprimentos - sangrias - trocos`

---

## 6. Catálogo (Vitrine)

**Acesso:** Público  
**Rota:** `/vitrine/:slug`

A vitrine é a loja online do negócio. Os clientes acessam pelo celular e fazem pedidos.

### Funcionalidades

- **Cardápio digital** com fotos, preços e categorias
- **Carrinho de compras**
- **Tipos de entrega:** Entrega, Retirada, Mesa (via QR Code)
- **Agendamento** de pedidos para data/hora futura
- **Checkout** com PIX, cartão ou dinheiro

### Integração com Mesas

- Cliente escaneia o QR Code da mesa
- O sistema identifica a mesa automaticamente
- Pedidos feitos pela mesa vão direto para a cozinha

---

## 7. Produtos

![Print: Formulário de cadastro de produto](prints/produto-form.png)

![Print: Listagem de produtos no catálogo](prints/produtos-lista.png)

**Acesso:** GERENTE, SUPER_ADMIN  
**Rota:** `Catálogo > Novo` ou `Catálogo > Editar`

### Cadastro de Produto

| Campo | Descrição |
|-------|-----------|
| **Nome** | Nome do produto (obrigatório) |
| **SKU** | Código interno |
| **Descrição** | Descrição detalhada |
| **Preço** | Preço de venda |
| **Categoria** | Categoria do produto |
| **Código de Barras** | Código de barras do produto |
| **Código PLU** | Código para balança Toledo |
| **Destaque** | Produto aparece primeiro na vitrine/PDV |
| **Controlar Estoque** | Ativa controle de estoque |
| **Vender por Peso** | Produto vendido por quilograma |
| **Imagem** | Foto do produto (upload) |

### Campos Fiscais (VAREJO)

- NCM
- CFOP
- Unidade de Medida

### Preço e Margem

- Preço de custo
- Margem de lucro (percentual ou fixo)
- Preço sugerido calculado automaticamente

### Status

| Status | Descrição |
|--------|-----------|
| **ATIVO** | Produto disponível para venda |
| **PAUSADO** | Produto temporariamente indisponível |
| **ESGOTADO** | Produto sem estoque (automático) |

---

## 8. Categorias

![Print: Gerenciamento de categorias](prints/categorias.png)

**Acesso:** GERENTE, SUPER_ADMIN (editar); VISUALIZADOR (visualizar)  
**Rota:** `/categorias`

### Gerenciar Categorias

- **Criar:** Nome, descrição, ordem (para ordenação)
- **Editar:** Altere nome, descrição, ordem, ativo/inativo
- **Remover:** Produtos da categoria perdem a categoria (ficam sem categoria)

> A ordem definida aqui é respeitada na vitrine e no PDV.

---

## 9. Combos

![Print: Listagem de combos com cards](prints/combos.png)

![Print: Formulário de criação de combo](prints/combos-form.png)

**Acesso:** GERENTE, SUPER_ADMIN  
**Rota:** `/combos`

Combos permitem agrupar vários produtos por um preço especial.

### Criar Combo

1. **Nome e descrição** do combo
2. **Preço total** do combo
3. **Selecionar produtos** que fazem parte do combo e suas quantidades
4. **Foto** do combo (upload)
5. **Ativar** o combo para aparecer no PDV e na vitrine

### Onde aparecem

- **PDV:** Na busca, exibe cards dos combos ativos
- **Vitrine:** Seção "Combos Imperdíveis" antes dos produtos
- Ao selecionar um combo no PDV, todos os itens são adicionados ao carrinho

---

## 10. Pedidos

![Print: Lista de pedidos com filtros](prints/pedidos.png)

![Print: Modal de detalhes do pedido](prints/pedidos-detalhe.png)

**Acesso:** OPERADOR, GERENTE, SUPER_ADMIN, VISUALIZADOR  
**Rota:** `/pedidos`

### Status dos Pedidos

| Status | Descrição |
|--------|-----------|
| **PENDENTE** | Aguardando confirmação (PIX/cartão) |
| **CONFIRMADO** | Pagamento confirmado, indo para cozinha |
| **PREPARANDO** | Sendo preparado |
| **PRONTO** | Aguardando retirada/entrega |
| **SAIU P/ ENTREGA** | Saiu para entrega |
| **ENTREGUE** | Entregue |
| **CANCELADO** | Cancelado |

### Fluxo

1. **Vitrine/PDV:** Cliente faz o pedido
2. **Confirmação:** Se for dinheiro, confirma automaticamente. Se PIX/cartão, aguarda pagamento
3. **Cozinha:** O pedido aparece na Cozinha e em Pedidos
4. **Preparo:** Cozinha marca como "Preparando" → "Pronto"
5. **Entrega:** Se for entrega, sai para entrega → entregue

### Filtros

- Por data (início/fim)
- Por status
- Busca por nome do cliente

### Impressão automática

- Pedidos novos (vitrine) imprimem comanda automaticamente
- No PDV, a comanda/cupom é impressa conforme configurado

---

## 11. Cozinha

![Print: Tela da cozinha com fila de pedidos](prints/cozinha.png)

**Acesso:** OPERADOR, GERENTE, SUPER_ADMIN  
**Rota:** `/cozinha`

Tela específica para a cozinha acompanhar pedidos em tempo real.

### Funcionalidades

- Lista de pedidos pendentes (fila)
- Atualização automática a cada 30s
- Botões para avançar status: **Preparando** → **Pronto**
- Exibe número da mesa para pedidos de balcão/mesa

> Pedidos são removidos da cozinha automaticamente quando marcados como "Pronto".

---

## 12. Estoque

![Print: Estoque com alertas de ruptura](prints/estoque.png)

![Print: Modal de movimentação de estoque](prints/estoque-movimentar.png)

**Acesso:** OPERADOR, GERENTE, SUPER_ADMIN  
**Rota:** `/estoque`

### Movimentações

| Tipo | Descrição | Entrada/Saída |
|------|-----------|:-------------:|
| **Entrada** | Compra de produtos | Entrada |
| **Saída (Venda)** | Venda no PDV (automático) | Saída |
| **Saída (Ajuste)** | Ajuste manual | Saída |
| **Perda** | Produto danificado/vencido | Saída |
| **Uso Interno** | Consumo interno | Saída |
| **Inventário** | Contagem física (substitui estoque) | Ambos |
| **Transferência** | Entre depósitos | Ambos |

### Alertas de Ruptura

- Disparado quando `estoqueAtual <= estoqueMinimo`
- O alerta é enviado via webhook (se configurado)
- Na tela de Estoque, há uma aba "Alertas de Ruptura"

### Histórico

- Cada movimentação é registrada com data, usuário, tipo e motivo
- Acessível pelo botão "Histórico" em cada item

---

## 13. Mesas

![Print: Gerenciamento de mesas](prints/mesas.png)

![Print: QR Code da mesa para impressão](prints/mesas-qrcode.png)

**Acesso:** OPERADOR, GERENTE, SUPER_ADMIN  
**Rota:** `/mesas` (apenas negócios do tipo COMIDA)

### Gerenciar Mesas

- **Criar:** Número e nome (opcional)
- **Ocupar:** Gera um QR Code para o cliente escanear
- **Liberar:** Libera a mesa quando o cliente sai
- **QR Code:** Imprime ou compartilha o QR Code da mesa

> Ao ocupar uma mesa, o sistema gera uma URL única que leva o cliente direto ao cardápio.

### Integração

- Cliente escaneia o QR → abre a vitrine com a mesa identificada
- Pedidos feitos pela mesa vão direto para a cozinha com o número da mesa
- Quando o cliente finaliza, o operador libera a mesa

---

## 14. Clientes

![Print: Listagem de clientes](prints/clientes.png)

**Acesso:** OPERADOR, GERENTE, SUPER_ADMIN  
**Rota:** `/clientes`

### Cadastro

- Nome, telefone, CPF, endereço
- Limite de crédito e saldo devedor (para vendas a prazo)

### Funcionalidades

- Busca por nome ou telefone
- Visualizar contas a receber do cliente
- Histórico de pedidos

---

## 15. Contas a Receber

![Print: Contas a receber com clientes](prints/contas-receber.png)

![Print: Modal de receber pagamento](prints/contas-receber-baixa.png)

**Acesso:** GERENTE, SUPER_ADMIN (dar baixa); OPERADOR (visualizar)  
**Rota:** `/contas-receber`

### Status

| Status | Descrição |
|--------|-----------|
| **PENDENTE** | Aguardando pagamento |
| **PARCIAL** | Parcialmente pago |
| **PAGO** | Quitado |
| **ATRASADO** | Vencido e não pago |

### Dar Baixa

1. Selecione o cliente
2. Informe o valor recebido
3. Opcional: observação
4. Confirme — o sistema distribui o pagamento nas contas mais antigas

> Apenas GERENTE e SUPER_ADMIN podem dar baixa. OPERADOR não tem permissão.

---

## 16. WhatsApp

![Print: Tela do WhatsApp](prints/whatsapp.png)

**Acesso:** OPERADOR, GERENTE, SUPER_ADMIN  
**Rota:** `/whatsapp`

### Chatbot

- Atenda clientes automaticamente com mensagens pré-configuradas
- O chatbot pode:
  - Mostrar o cardápio
  - Confirmar pedidos
  - Informar status do pedido
  - Tirar dúvidas

### Configuração

- Ativar/desativar chatbot nas Configurações do Negócio
- Mensagem de boas-vindas
- Mensagem fallback (quando não entende)

---

## 17. Negócios

![Print: Listagem de negócios](prints/negocios.png)

![Print: Detalhes do negócio com atalhos](prints/negocio-detalhe.png)

**Acesso:** SUPER_ADMIN apenas  
**Rota:** `/negocios`

### Gerenciar Negócios

- **Criar:** Nome, slug (URL), tipo (COMIDA/VAREJO), logo
- **Editar:** Alterar dados do negócio
- **Detalhes:** Visão geral com KPIs e atalhos

### Atalhos do Negócio

Na tela de detalhes:
- PDV, Caixa, Catálogo, Categorias, Estoque, Pedidos
- Clientes, Contas a Receber, Relatórios, Financeiro

### Configurações

Cada negócio tem suas próprias configurações (acessível via menu lateral em "Configurações"):

- [Geral](#231-geral)
- [Dados Fiscais](#232-dados-fiscais)
- [Endereço](#233-endereço)
- [Taxas de Frete](#234-taxas-de-frete)
- [Horário](#235-horário-de-funcionamento)
- [Estoque e Alertas](#236-estoque-e-alertas)
- [Impressão Térmica](#237-impressão-térmica)
- [Chatbot](#238-chatbot-whatsapp)

---

## 18. Usuários

![Print: Gerenciamento de usuários](prints/usuarios.png)

**Acesso:** SUPER_ADMIN apenas  
**Rota:** `/usuarios`

### Gerenciar Usuários

- **Criar:** Nome, e-mail, senha
- **Editar:** Alterar dados
- **Status:** Ativar/desativar usuário

> Usuários são globais (não por negócio). As permissões são definidas pelos [Membros](#19-membros).

---

## 19. Membros

![Print: Membros do negócio com funções](prints/membros.png)

**Acesso:** GERENTE, SUPER_ADMIN  
**Rota:** `/negocios/:id/membros`

Membros são os vínculos entre usuários e negócios, definindo o papel (role) de cada usuário em cada negócio.

### Convidar Membro

1. Informe o e-mail do usuário
2. Selecione a função: Gerente, Operador ou Visualizador
3. O usuário recebe acesso ao negócio

> SUPER_ADMIN não pode ser atribuído manualmente — apenas quem cria o negócio se torna SUPER_ADMIN automaticamente.

---

## 20. Relatórios

![Print: Tela de relatórios](prints/relatorios.png)

**Acesso:** GERENTE, SUPER_ADMIN  
**Rota:** `/relatorios`

### Relatórios Disponíveis

| Relatório | Descrição | Formato |
|-----------|-----------|---------|
| **Vendas** | Vendas por período, produto, categoria | CSV |
| **Financeiro** | Faturamento, custos, lucro | CSV |
| **Pedidos** | Todos os pedidos com detalhes | CSV |
| **Resumo Financeiro** | KPIs do período | Tela |

### Filtros

- Período (data início/fim)

---

## 21. Financeiro

![Print: Financeiro com KPIs e tabela](prints/financeiro.png)

**Acesso:** GERENTE, SUPER_ADMIN  
**Rota:** `/financeiro`

### Indicadores

| Indicador | Descrição |
|-----------|-----------|
| **Faturamento** | Total de vendas no período |
| **Custos** | Custo dos produtos vendidos |
| **Lucro Líquido** | Faturamento - Custos |
| **Margem Média** | Percentual de lucro |
| **Total Pedidos** | Quantidade de pedidos |
| **Ticket Médio** | Valor médio por pedido |

### Lucro por Produto

Tabela detalhada mostrando por produto:
- Quantidade vendida
- Receita gerada
- Custo total
- Lucro
- Margem (%)

### Por Forma de Pagamento

Gráfico de barras com o faturamento por método de pagamento.

---

## 22. Auditoria

![Print: Auditoria com filtros](prints/auditoria.png)

**Acesso:** GERENTE, SUPER_ADMIN  
**Rota:** `/auditoria`

Registro de todas as ações importantes no sistema:

- Criação, alteração e exclusão de registros
- Usuário responsável
- Data e hora
- IP e dispositivo

### Filtros

- Por período
- Por usuário
- Por descrição

---

## 23. Configurações do Negócio

**Acesso:** GERENTE, SUPER_ADMIN  
**Rota:** `/negocios/:id/configuracoes`

Organizado em seções para facilitar a navegação:

### 23.1 Geral

- **Telefone de Contato:** Telefone do estabelecimento
- **Taxa de Frete:** Valor padrão do frete

### 23.2 Dados Fiscais

- **Razão Social:** Nome da empresa para NF-e
- **CNPJ:** Cadastro Nacional da Pessoa Jurídica
- **Inscrição Estadual:** IE para emissão fiscal

### 23.3 Endereço

- Rua, número, bairro, cidade, estado, CEP

### 23.4 Taxas de Frete

- Configure valores de frete específicos para cada bairro
- Se o bairro não estiver listado, usa a taxa geral

### 23.5 Horário de Funcionamento

- Configure dias e horários de funcionamento
- Marque "Fechado" para dias sem funcionamento
- A vitrine exibe "Aberto" ou "Fechado" baseado nestes horários

### 23.6 Estoque e Alertas

| Configuração | Descrição |
|-------------|-----------|
| **Controle de Estoque** | Ativa/desativa controle automático |
| **Estoque Mínimo Padrão** | Valor para novos produtos |
| **Webhook URL** | URL para receber alertas de ruptura via POST |
| **Email para Alertas** | Email para receber notificações |

### 23.7 Impressão Térmica

Configure impressoras para comandas e cupons:

| Campo | Descrição |
|-------|-----------|
| **Nome** | Nome da impressora (para identificação) |
| **Tipo** | Térmica, Matricial ou Laser |
| **Conexão** | Rede (TCP/IP), USB ou Bluetooth |
| **IP** | Endereço IP (obrigatório para REDE) |
| **Porta** | Porta TCP (padrão 9100) |
| **Papel** | 80mm ou 58mm |
| **Uso** | Cozinha (comanda) ou Operador (cupom) |
| **Operador** | Vincular a um operador específico |
| **Ativa** | Habilita/desabilita a impressora |

**Como funciona cada tipo de conexão:**

| Conexão | Como imprime | Quem processa |
|---------|-------------|:--------------:|
| **REDE** | TCP/IP direto na porta configurada | Backend (automático) |
| **USB** | WebUSB (navegador) + QZ Tray | Frontend |
| **Bluetooth** | Web Bluetooth + QZ Tray | Frontend |

> **Recomendado:** Use impressoras REDE para maior confiabilidade — o backend envia os comandos diretamente sem depender do navegador.

### 23.8 Chatbot WhatsApp

| Configuração | Descrição |
|-------------|-----------|
| **Chatbot Ativo** | Liga/desliga o atendimento automático |
| **Mensagem de Boas-Vindas** | Mensagem inicial ao cliente |
| **Mensagem Fallback** | Quando o chatbot não entende |

---

## 24. Atalhos de Teclado

### PDV

| Tecla | Ação |
|-------|------|
| `F2` | Abrir busca de produtos |
| `F8` | Finalizar venda (checkout) |
| `F11` | Alternar tela cheia |
| `Esc` | Fechar modal / cancelar busca |
| `Del` | Limpar carrinho |
| `↑ ↓` | Navegar na lista de busca |
| `Enter` | Confirmar seleção / adicionar produto |
| `1` | Pagamento: Dinheiro |
| `2` | Pagamento: Cartão Crédito |
| `3` | Pagamento: Cartão Débito |
| `4` | Pagamento: PIX |
| `5` | Pagamento: Crediário |

### Geral

| Tecla | Ação |
|-------|------|
| `F11` | Alternar tela cheia |

---

## Imagens e Upload

O sistema utiliza **Supabase Storage** (S3) para armazenar:

- **Fotos de produtos**
- **Logotipos de negócios**
- **Banners**
- **Fotos de combos**

O upload é feito via **URL pré-assinada**: o backend gera uma URL temporária, o frontend faz upload direto para o S3 e confirma.

---

## Offline

O sistema possui suporte offline para:

- **Cache de produtos** (IndexedDB) — PDV funciona sem internet
- **Cache da vitrine** — Clientes podem ver o cardápio offline
- **Fila de pedidos offline** — Pedidos feitos offline são enviados quando a conexão volta

> O PDV em modo offline usa dados em cache e enfileira os pedidos. Quando a internet volta, os pedidos são processados automaticamente.

---

## Impressão

### QZ Tray

Para impressão via QZ Tray:
1. Instale o QZ Tray no computador
2. Conecte a impressora via USB ou rede
3. No sistema, configure a impressora com o nome que aparece no QZ Tray
4. O sistema detecta automaticamente e imprime comandas/cupons

### Fallback

Se o QZ Tray não estiver disponível:
1. **WebUSB:** Conecte a impressora via USB e autorize no navegador
2. **Impressão do navegador:** Abre o diálogo de impressão do sistema

---

> **Documentação gerada em Julho/2026** — Para dúvidas, entre em contato com o suporte.
