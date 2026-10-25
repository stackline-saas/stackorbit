# 🗺️ Diretório de Planos de Arquitetura & Evolução

Este diretório contém as especificações técnicas, decisões arquiteturais e cronogramas de implementação de novas funcionalidades do **StackOrbit**.

---

## 📑 Documentos Disponíveis

| Documento | Descrição | Status |
| :--- | :--- | :--- |
| [**architecture-multi-host.md**](./architecture-multi-host.md) | Arquitetura técnica de Multi-Projetos, Conexão Universal de Servidores (SSH, TLS, Edge Agent) e Roteamento Global com Traefik | 🟢 Aprovado |
| [**phases.md**](./phases.md) | Cronograma passo a passo detalhado dividido em 5 fases de desenvolvimento | 🟡 Pronto para Execução |

---

## 🧭 Estratégia de Branches (Git Flow)

* **Branch da Feature:** `feat/multi-host-projects`
* **Base:** `develop`
* **Destino:** Pull Request validado com CI para `develop`
