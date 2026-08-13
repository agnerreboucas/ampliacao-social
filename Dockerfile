# Imagem da plataforma.
#
# Existe para a aplicação rodar igual em qualquer lugar que aceite um contêiner
# — Render, Railway, Fly, Cloud Run, Coolify, ou um Docker Compose no servidor da
# agência. Sem ela, cada hospedagem exigiria uma configuração própria de versão
# de Node, comando de build e comando de partida.
#
#   docker build -t ampliacao-social .
#   docker run -p 3000:3000 \
#     -e DATABASE_URL=... -e SESSION_SECRET=... ampliacao-social

# --- Etapa 1: instalar dependências ------------------------------------------
#
# Separada da cópia do código de propósito: enquanto o package.json não mudar,
# esta camada vem do cache e o build leva segundos em vez de minutos.
FROM node:22-slim AS dependencias
WORKDIR /app

COPY package.json package-lock.json* ./
# `--ignore-scripts` evita que um pacote execute código na instalação. O
# Playwright, que é dependência de desenvolvimento, tentaria baixar navegadores.
RUN npm ci --ignore-scripts

# --- Etapa 2: gerar o pacote --------------------------------------------------
FROM node:22-slim AS construcao
WORKDIR /app

COPY --from=dependencias /app/node_modules ./node_modules
COPY . .

ENV NITRO_PRESET=node-server
RUN npm run build

# --- Etapa 3: a imagem que vai para o ar --------------------------------------
#
# Só o resultado do build e as dependências de produção. A árvore de
# desenvolvimento — TypeScript, ESLint, Playwright — fica para trás, o que
# derruba o tamanho da imagem e a superfície de ataque junto.
FROM node:22-slim AS producao
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY package.json ./
COPY --from=construcao /app/dist ./dist

# O `pg` é a única dependência que o pacote gerado ainda carrega em tempo de
# execução; o resto foi embutido pelo empacotador.
RUN npm install pg@^8.22.0 --omit=dev --ignore-scripts \
  && npm cache clean --force

# Não rodar como root. A imagem do Node já traz o usuário "node".
USER node

EXPOSE 3000

# O provedor usa isto para saber se a instância está sadia. O teste toca o
# banco, então uma instalação com o banco fora do ar é retirada do ar em vez de
# continuar recebendo gente.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server/index.mjs"]
