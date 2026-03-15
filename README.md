# 🍿 Stremio Addon — Pipocas.tv Legendas

Addon para o **Stremio** que procura e disponibiliza legendas em **Português (PT/BR)** do site [Pipocas.tv](https://pipocas.tv).

---

## ✨ Funcionalidades

- 🔍 Pesquisa automática de legendas por IMDB ID
- 🎬 Suporte para **filmes** e **séries**
- 🇵🇹 Legendas em **Português Europeu** e **Português do Brasil**
- 🔐 Cada utilizador configura as suas credenciais Pipocas.tv na definição do addon no Stremio (não são guardadas no servidor do addon)

---

## 📋 Pré-requisitos

- [Node.js](https://nodejs.org/) v14 ou superior
- Conta registada em [Pipocas.tv](https://pipocas.tv)

> **Nota:** O Pipocas.tv requer conta registada para efetuar downloads de legendas. As credenciais são introduzidas **no Stremio**, ao configurar o addon; são usadas apenas para autenticação no site Pipocas.tv.

---

## 🔒 Segurança e privacidade

- **Credenciais:** Só as que o utilizador introduz na configuração do addon no Stremio. O addon não usa ficheiros `.env` nem credenciais por defeito.
- **Uso:** As credenciais são enviadas apenas ao domínio **pipocas.tv** para iniciar sessão e descarregar legendas em nome do utilizador.
- **Localização e rastreio:** O addon não regista nem expõe IPs de utilizadores, nem envia cabeçalhos que identifiquem o cliente. Os logs não incluem endereços IP nem dados que permitam rastrear quem usa o addon.
- Recomenda-se utilizar uma palavra-passe específica para o Pipocas.tv e não reutilizar noutros serviços.

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

### 3. (Opcional) Variáveis de ambiente

Para desenvolvimento local, podes definir no `.env` apenas a porta (as credenciais configuram-se no Stremio):

```env
PORT=7000
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
4. Cola o URL: `http://127.0.0.1:7000/manifest.json` (ou o URL público do addon)
5. Confirma a instalação
6. **Configura o addon:** abre as opções do addon e introduce o teu **utilizador** e **palavra-passe** do Pipocas.tv (obrigatório para ver legendas)

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
