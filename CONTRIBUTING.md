# 🤝 Guia de Contribuição e Fluxo Colaborativo (GitHub Flow)

Obrigado por contribuir com o **StackOrbit**! Este documento orienta como estruturar branches, commits, testes e Pull Requests para manter o repositório organizado, estável e ágil.

---

## 🧭 1. Estratégia de Branches (GitHub Flow)

Adotamos o modelo **GitHub Flow**, focado em simplicidade e entrega contínua:

* `master` (ou `main`): branch principal de produção, sempre estável e pronta para deploy.
* **Branches de Feature/Fix**: todas as alterações nascem a partir da branch principal e retornam via Pull Request.

### Nomenclatura Padrão de Branches

| Prefixo | Finalidade | Exemplo |
| :--- | :--- | :--- |
| `feat/` | Nova funcionalidade | `feat/load-balancer-healthcheck` |
| `fix/` | Correção de bug | `fix/traefik-sync-socket` |
| `refactor/`| Refatoração de código sem alterar comportamento | `refactor/service-modal-tabs` |
| `docs/` | Documentação | `docs/update-api-routes` |
| `chore/` | Ajuste de build, CI ou dependências | `chore/upgrade-pnpm-actions` |

---

## 🔄 2. Passo a Passo do Fluxo de Trabalho

### 1. Atualizar a branch principal
Antes de iniciar qualquer tarefa, certifique-se de estar com a última versão:
```bash
git checkout master
git pull origin master
```

### 2. Criar sua branch de trabalho
```bash
git checkout -b feat/nome-da-sua-feature
```

### 3. Desenvolver e Testar Localmente
Inicie os serviços necessários:
```bash
# Rodar desenvolvimento
pnpm dev:backend   # API Node.js / Express
pnpm dev:frontend  # UI Vite / React
pnpm dev:worker    # Worker BullMQ de builds

# Validar antes do commit
pnpm build         # Compilação TypeScript de todos os pacotes do monorepo
```

### 4. Padrão de Commits (Conventional Commits)
Utilizamos o padrão [Conventional Commits](https://www.conventionalcommits.org/):

* `feat: adicionar suporte a balanceamento de carga entre réplicas`
* `fix: corrigir sincronização do dynamic_conf.yml com container remoto`
* `docs: atualizar instruções de configuração de origin CA`
* `refactor: simplificar métodos de parsing de containers do dockerode`

Exemplo de commit:
```bash
git add .
git commit -m "feat(traefik): sincronizar configuracao dinamica com container"
```

### 5. Enviar para o GitHub e abrir Pull Request
```bash
git push -u origin feat/nome-da-sua-feature
```

Após o push:
1. Abra o GitHub no repositório.
2. Clique em **"Compare & pull request"**.
3. Preencha o template de Pull Request (descrição, testes e checklist).
4. O **GitHub Actions (CI)** rodará automaticamente validando a compilação do monorepo (`pnpm build`).
5. Solicite a revisão de pelo menos 1 membro da equipe antes do merge.

---

## 🔒 3. Boas Práticas e Regras de Ouro

1. **Nunca faça commit de arquivos `.env` ou secrets**: Chaves de API, senhas do Postgres/Redis e certificados privados nunca devem ser versionados.
2. **Atualize o `.env.example`**: Sempre que adicionar uma nova variável de ambiente na API ou Worker, documente-a com um valor padrão ou de exemplo no arquivo `.env.example`.
3. **Mantenha PRs pequenos e focados**: Pull Requests com poucas alterações contextuais são revisados e aprovados com muito mais rapidez e segurança.
4. **Merge via "Squash and merge" ou "Rebase"**: Mantém o histórico da branch principal limpo e linear.
