# 🍿 Stremio Addon — Pipocas.tv Legendas

Addon para o **Stremio** que procura e disponibiliza legendas em **Português (PT/BR)** do site [Pipocas.tv](https://pipocas.tv).

---

## ✨ Funcionalidades

- 🔍 Pesquisa automática de legendas por IMDB ID
- 🎬 Suporte para **filmes** e **séries**
- 🇵🇹 Legendas em **Português Europeu** e **Português do Brasil**
- 🔐 Login automático com conta Pipocas.tv

---

## 📋 Pré-requisitos

- [Node.js](https://nodejs.org/) v14 ou superior
- Conta registada em [Pipocas.tv](https://pipocas.tv)

> **Nota:** O Pipocas.tv requer conta registada para efetuar downloads de legendas.

---

## 🚀 Instalação

### 1. Clona o repositório

```bash
git clone https://github.com/teu-user/stremio-pipocas-addon.git
cd stremio-pipocas-addon
```

### 2. Instala as dependências

```bash
npm install
```

### 3. Configura as credenciais

Copia o ficheiro de exemplo e preenche as tuas credenciais:

```bash
cp .env.example .env
```

Edita o ficheiro `.env`:

```env
PIPOCAS_USER=o_teu_username
PIPOCAS_PASS=a_tua_password
PORT=7000
```

Opcionalmente, podes adicionar uma chave da API [OMDB](https://www.omdbapi.com/apikey.aspx) (gratuita) para melhorar a pesquisa por título:

```env
OMDB_API_KEY=a_tua_chave_omdb
```

### 4. Inicia o addon

```bash
npm start
```

Verás uma mensagem como:

```
🍿 Pipocas.tv Stremio Addon running!
📡 Addon URL: http://127.0.0.1:7000/manifest.json
```

---

## 📱 Instalar no Stremio

1. Abre o **Stremio**
2. Vai a **⚙️ Definições → Addons**
3. Clica em **"+ Add addon"**
4. Cola o URL: `http://127.0.0.1:7000/manifest.json`
5. Confirma a instalação

Ou abre diretamente no browser:
```
stremio://127.0.0.1:7000/manifest.json
```

---

## 🌐 Alojamento público (opcional)

Para usar o addon sem precisar de ter o servidor a correr localmente, podes fazer deploy em:

- **[Railway](https://railway.app)** — gratuito com conta GitHub
- **[Render](https://render.com)** — plano gratuito disponível
- **[Heroku](https://heroku.com)** — plano básico

Depois de fazer deploy, usa o URL público como endereço do addon no Stremio.

---

## 🔧 Estrutura do projeto

```
stremio-pipocas-addon/
├── index.js        # Servidor principal do addon
├── pipocas.js      # Módulo de pesquisa no Pipocas.tv
├── manifest.json   # Manifesto do addon Stremio
├── package.json    # Dependências Node.js
├── .env.example    # Exemplo de configuração
└── README.md       # Este ficheiro
```

---

## ⚠️ Notas

- O Pipocas.tv usa Cloudflare — em alguns casos pode ser necessário ajustar os headers do pedido HTTP.
- Os downloads requerem sessão autenticada válida.
- Usa este addon de forma responsável e respeita as [regras do Pipocas.tv](https://pipocas.tv/regras).

---

## 📄 Licença

MIT — Feito com ❤️ para a comunidade portuguesa.
