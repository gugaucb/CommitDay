# CommitDay 📊

**CommitDay** é um dashboard web moderno, ágil e interativo desenvolvido para gerentes de equipes de desenvolvimento monitorarem a constância e aderência diária de commits no GitLab, prevenindo perda de código e garantindo a continuidade do fluxo de trabalho.

---

## 🚀 Funcionalidades

- **Múltiplos Projetos & Squads:** Gestão de diferentes projetos com vinculação N:N de desenvolvedores.
- **PAT por Projeto com Fallback Global:** Suporte a Personal Access Token individual por projeto do GitLab com botão de teste de conexão e fallback para token global.
- **Persistência Híbrida (SQLite / Arquivo / Navegador):** Armazenamento em banco de dados SQLite (padrão) ou arquivo JSON persistente no backend Python/FastAPI, com fallback gracioso para o `localStorage` do navegador caso executado de forma puramente estática.
- **Suporte a Docker & Docker Compose:** Containerização pronta para produção com volume montado no host (`./data:/app/data`), garantindo que seus dados nunca se percam.
- **Dashboard de Métricas em Tempo Real:** Aderência global da equipe, total de devs ativos, commits no dia e alerta visual de desenvolvedores sem commit.
- **Matriz Diária de Commits (Heatmap):** Grade interativa exibindo dias com commit (verde), dias úteis sem commit (vermelho) e finais de semana (cinza).
- **Taxa de Aderência & Streaks:** Cálculo automático da taxa % em dias úteis (Segunda a Sexta) e marcador de sequência de dias (*Streak* 🔥).
- **Modo Duplo de Operação:**
  - **Modo Demo:** Dados simulados realistas para demonstrações imediatas.
  - **Modo GitLab Real:** Conexão direta com a API REST do GitLab (v4).
- **Exportação de Relatórios em CSV:** Download instantâneo de métricas e aderência da equipe para auditoria.

---

## 🐳 Executando com Docker Compose (Recomendado)

A forma mais simples e robusta de executar o CommitDay com persistência permanente em SQLite:

```bash
# 1. Subir o container em segundo plano
docker compose up -d

# 2. Acompanhar os logs (opcional)
docker compose logs -f
```

Acesse no seu navegador: **[http://localhost:3000](http://localhost:3000)**

> **🔒 Garantia de Persistência:** Os dados do SQLite ficam gravados na pasta local `./data/commitday.db` através do volume mapeado `./data:/app/data`. Você pode reiniciar, parar ou recriar os containers sem perder nenhuma configuração ou desenvolvedor cadastrado.

Para parar o container:
```bash
docker compose down
```

---

## 🐍 Executando Localmente com Python

Caso prefira rodar diretamente no seu ambiente Python:

```bash
# 1. Instalar dependências
pip install -r requirements.txt

# 2. Iniciar o servidor (porta 3000 padrão)
python server.py

# Ou via Uvicorn diretamente
uvicorn server:app --host 0.0.0.0 --port 3000
```

---

## ⚙️ Variáveis de Ambiente

| Variável | Descrição | Padrão |
|:---|:---|:---|
| `STORAGE_TYPE` | Tipo de driver de persistência: `sqlite` ou `file` | `sqlite` |
| `DATA_DIR` | Diretório no qual o banco de dados ou arquivos serão salvos | `./data` |
| `PORT` | Porta HTTP na qual o servidor responderá | `3000` |
| `HOST` | Interface de rede para bind | `0.0.0.0` |

### Exemplo usando Armazenamento em Arquivo JSON:
```bash
STORAGE_TYPE=file python server.py
```
*(Gera os dados em `./data/storage.json`)*

---

## 🌐 Execução Estática Pura (Sem Backend)

Se desejar abrir o CommitDay sem rodar nenhum backend, basta abrir o arquivo `index.html` em qualquer navegador ou servidor estático simples (`python -m http.server 3000`). A aplicação detectará automaticamente a ausência do backend e utilizará o `localStorage` do navegador com total transparência.

---

## 🛠️ Tecnologias Utilizadas

- **Backend:** Python 3.11+, FastAPI, Uvicorn, SQLite3 nativo
- **Frontend:** Vanilla JavaScript (ES6+), HTML5 Semântico, CSS3 Moderno (Glassmorphism, Dark Mode, CSS Variables)
- **DevOps:** Docker, Docker Compose (Multi-platform, Alpine/Slim)
- **Integração:** GitLab REST API v4
