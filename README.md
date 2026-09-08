# CommitDay 📊

**CommitDay** é um dashboard web moderno e interativo desenvolvido para gerentes de equipes ágeis monitorarem a constância de commits dos desenvolvedores no GitLab, prevenindo perda de código e garantindo a aderência aos processos de trabalho.

## 🚀 Funcionalidades

- **Dashboard de Métricas:** Aderência global da equipe, total de devs ativos, commits no dia e alerta de devs sem commit.
- **Matriz Diária de Commits (Calendário):** Tabela estilo heatmap identificando dias com commit (verde), dias úteis sem commit (vermelho) e finais de semana (cinza).
- **Indicador de Aderência:** Cálculo automático da taxa % em dias úteis (Segunda a Sexta) e marcador de sequência de dias (*Streak* 🔥).
- **Modo Duplo de Dados:**
  - **Modo Demo:** Dados simulados realistas para visualização e testes sem necessidade de token.
  - **Modo GitLab Real:** Conexão direta com a API REST do GitLab via Personal Access Token.
- **Gerenciamento Dinâmico:** Cadastro e remoção de desenvolvedores por nome, e-mail do GitLab e squad.
- **Exportação CSV:** Relatórios completos de aderência prontos para download.

## 🛠️ Tecnologias Utilizadas

- HTML5 Semântico & Vanilla JavaScript
- CSS3 Moderno (Glassmorphism, Dark Mode, CSS Variables)
- GitLab REST API v4

## 📦 Como Executar

Basta abrir o arquivo `index.html` em qualquer navegador web ou servir via um servidor estático simples:

```bash
python -m http.server 3000
```

Acesse em `http://localhost:3000`.
