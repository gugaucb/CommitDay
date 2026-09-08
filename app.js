/**
 * CommitDay - Dashboard de Monitoramento Diário de Commits no GitLab
 * Lógica principal da aplicação
 */

// Chaves do localStorage
const STORAGE_KEYS = {
  DEVS: 'commitday_developers',
  PROJECTS: 'commitday_projects',
  SELECTED_PROJECT: 'commitday_selected_project_id',
  CONFIG: 'commitday_gitlab_config',
  MODE: 'commitday_data_mode'
};

// Desenvolvedores padrão para o Modo Demo
const DEFAULT_DEMO_DEVS = [
  { id: 'dev-1', name: 'Ana Silva', email: 'ana.silva@empresa.com', username: 'anasilva', team: 'Squad Checkout', projectIds: ['proj-1', 'proj-2'] },
  { id: 'dev-2', name: 'Bruno Costa', email: 'bruno.costa@empresa.com', username: 'brunocosta', team: 'Squad Backend', projectIds: ['proj-1', 'proj-3'] },
  { id: 'dev-3', name: 'Carla Mendes', email: 'carla.mendes@empresa.com', username: 'carlamendes', team: 'Squad Frontend', projectIds: ['proj-1'] },
  { id: 'dev-4', name: 'Diego Oliveira', email: 'diego.oliveira@empresa.com', username: 'diegooliveira', team: 'Squad Mobile', projectIds: ['proj-2'] },
  { id: 'dev-5', name: 'Elena Rostova', email: 'elena.rostova@empresa.com', username: 'elenarostova', team: 'Squad DevOps', projectIds: ['proj-3'] },
  { id: 'dev-6', name: 'Felipe Santos', email: 'felipe.santos@empresa.com', username: 'felipesantos', team: 'Squad Core', projectIds: ['proj-3'] }
];

// Projetos padrão para o Modo Demo
const DEFAULT_DEMO_PROJECTS = [
  { id: 'proj-1', name: 'Plataforma E-commerce', description: 'Sistema principal de vendas e checkout', gitlabProjectId: '101', gitlabUrl: '', gitlabToken: '', devIds: ['dev-1', 'dev-2', 'dev-3'] },
  { id: 'proj-2', name: 'App Mobile Core', description: 'Aplicativo iOS/Android dos clientes', gitlabProjectId: '102', gitlabUrl: '', gitlabToken: '', devIds: ['dev-1', 'dev-4'] },
  { id: 'proj-3', name: 'Infraestrutura & Cloud', description: 'Automação CI/CD e Kubernetes', gitlabProjectId: '103', gitlabUrl: '', gitlabToken: '', devIds: ['dev-2', 'dev-5', 'dev-6'] }
];

// Estado da Aplicação
const state = {
  mode: 'demo', // 'demo' | 'gitlab'
  periodDays: 30,
  searchTerm: '',
  statusFilter: 'all',
  selectedProjectId: 'all', // 'all' ou ID do projeto
  projects: [],
  developers: [],
  gitlabConfig: {
    url: 'https://gitlab.com',
    token: '',
    projectId: ''
  },
  commitData: {}, // Map<devId, Map<dateString, commitCount>>
  isLoading: false
};

// Controle de Conexão com o Backend (SQLite / Arquivo / Local)
const backendState = {
  active: false,
  storageType: 'local', // 'sqlite' | 'file' | 'local'
  storagePath: ''
};

// Inicialização da Aplicação
document.addEventListener('DOMContentLoaded', async () => {
  loadStateFromStorage();
  setupEventListeners();
  refreshDashboard();
  updateStorageIndicator();

  // Tenta conectar ao backend FastAPI (SQLite/Arquivo)
  await initBackendStorage();
});

// Sonda o backend e inicializa a persistência remota
async function initBackendStorage() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const res = await fetch('/api/health', { signal: controller.signal });
    clearTimeout(timeoutId);

    if (res.ok) {
      const health = await res.json();
      backendState.active = true;
      backendState.storageType = health.storage_type || 'sqlite';
      backendState.storagePath = health.storage_path || '';

      // Busca dados sincronizados do servidor
      const dataRes = await fetch('/api/data');
      if (dataRes.ok) {
        const serverData = await dataRes.json();
        
        if (Array.isArray(serverData.projects) && serverData.projects.length > 0) {
          state.projects = serverData.projects.map(proj => ({
            ...proj,
            gitlabUrl: proj.gitlabUrl || '',
            gitlabToken: proj.gitlabToken || ''
          }));
        }
        if (Array.isArray(serverData.developers) && serverData.developers.length > 0) {
          state.developers = serverData.developers.map(dev => ({
            ...dev,
            projectIds: Array.isArray(dev.projectIds) ? dev.projectIds : []
          }));
        }
        if (serverData.config) {
          state.gitlabConfig = serverData.config;
        }
        if (serverData.mode) {
          state.mode = serverData.mode;
        }
        if (serverData.selectedProjectId) {
          state.selectedProjectId = serverData.selectedProjectId;
        }

        // Salva cópia local para resiliência
        localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(state.projects));
        localStorage.setItem(STORAGE_KEYS.DEVS, JSON.stringify(state.developers));
        localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(state.gitlabConfig));
        localStorage.setItem(STORAGE_KEYS.MODE, state.mode);
        localStorage.setItem(STORAGE_KEYS.SELECTED_PROJECT, state.selectedProjectId);

        refreshDashboard();
      }
    }
  } catch (e) {
    // Backend offline ou modo puramente estático
    backendState.active = false;
    backendState.storageType = 'local';
  }

  updateStorageIndicator();
}

// Atualiza o indicador visual de armazenamento no rodapé
function updateStorageIndicator() {
  const indicator = document.getElementById('storage-status-indicator');
  const text = document.getElementById('storage-status-text');
  const dot = indicator ? indicator.querySelector('.storage-dot') : null;

  if (!indicator || !text) return;

  if (backendState.active) {
    if (backendState.storageType === 'sqlite') {
      if (dot) dot.className = 'storage-dot sqlite';
      text.textContent = 'Armazenamento: SQLite';
      indicator.title = `Persistência ativa em SQLite (${backendState.storagePath})`;
    } else if (backendState.storageType === 'file') {
      if (dot) dot.className = 'storage-dot file';
      text.textContent = 'Armazenamento: Arquivo JSON';
      indicator.title = `Persistência ativa em Arquivo JSON (${backendState.storagePath})`;
    }
  } else {
    if (dot) dot.className = 'storage-dot local';
    text.textContent = 'Armazenamento: Navegador';
    indicator.title = 'Persistência no localStorage do navegador (sem backend)';
  }
}

// Sincroniza dados com o backend com debounce
let syncDebounceTimer = null;
function syncStateToBackend() {
  if (!backendState.active) return;

  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(async () => {
    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          developers: state.developers,
          projects: state.projects,
          config: state.gitlabConfig,
          mode: state.mode,
          selectedProjectId: state.selectedProjectId
        })
      });
    } catch (err) {
      console.warn('Erro ao sincronizar com o backend:', err);
    }
  }, 250);
}

// Carrega configurações, projetos e desenvolvedores do localStorage
function loadStateFromStorage() {
  const savedMode = localStorage.getItem(STORAGE_KEYS.MODE);
  if (savedMode) state.mode = savedMode;

  const savedSelectedProject = localStorage.getItem(STORAGE_KEYS.SELECTED_PROJECT);
  if (savedSelectedProject) state.selectedProjectId = savedSelectedProject;

  // Carrega ou inicializa projetos (com migração de credenciais)
  const savedProjects = localStorage.getItem(STORAGE_KEYS.PROJECTS);
  if (savedProjects) {
    try {
      const loadedProjects = JSON.parse(savedProjects);
      // Migração: garante gitlabUrl e gitlabToken em todos os projetos
      state.projects = loadedProjects.map(proj => ({
        ...proj,
        gitlabUrl: proj.gitlabUrl || '',
        gitlabToken: proj.gitlabToken || ''
      }));
    } catch (e) {
      state.projects = [...DEFAULT_DEMO_PROJECTS];
    }
  } else {
    state.projects = [...DEFAULT_DEMO_PROJECTS];
    saveProjectsToStorage();
  }

  // Carrega desenvolvedores com migração de dados
  const savedDevs = localStorage.getItem(STORAGE_KEYS.DEVS);
  if (savedDevs) {
    try {
      const loadedDevs = JSON.parse(savedDevs);
      // Migração: garante propriedade projectIds em todos os devs
      state.developers = loadedDevs.map(dev => ({
        ...dev,
        projectIds: Array.isArray(dev.projectIds) ? dev.projectIds : []
      }));
    } catch (e) {
      state.developers = [...DEFAULT_DEMO_DEVS];
    }
  } else {
    state.developers = [...DEFAULT_DEMO_DEVS];
    saveDevelopersToStorage();
  }

  const savedConfig = localStorage.getItem(STORAGE_KEYS.CONFIG);
  if (savedConfig) {
    try {
      state.gitlabConfig = JSON.parse(savedConfig);
    } catch (e) {}
  }
}

function saveDevelopersToStorage() {
  localStorage.setItem(STORAGE_KEYS.DEVS, JSON.stringify(state.developers));
  syncStateToBackend();
}

function saveProjectsToStorage() {
  localStorage.setItem(STORAGE_KEYS.PROJECTS, JSON.stringify(state.projects));
  syncStateToBackend();
}

function saveSelectedProjectToStorage() {
  localStorage.setItem(STORAGE_KEYS.SELECTED_PROJECT, state.selectedProjectId);
  syncStateToBackend();
}

function saveConfigToStorage() {
  localStorage.setItem(STORAGE_KEYS.CONFIG, JSON.stringify(state.gitlabConfig));
  syncStateToBackend();
}

function saveModeToStorage() {
  localStorage.setItem(STORAGE_KEYS.MODE, state.mode);
  syncStateToBackend();
}


// Funções Utilitárias de Gerenciamento de Projetos
function getDevsForProject(projectId) {
  if (!projectId || projectId === 'all') return state.developers;
  const project = state.projects.find(p => p.id === projectId);
  if (!project) return state.developers;

  return state.developers.filter(dev => 
    (project.devIds && project.devIds.includes(dev.id)) ||
    (dev.projectIds && dev.projectIds.includes(projectId))
  );
}

// Retorna credenciais do projeto ou fallback global
function getProjectCredentials(project) {
  const url = (project && project.gitlabUrl) ? project.gitlabUrl : (state.gitlabConfig.url || '');
  const token = (project && project.gitlabToken) ? project.gitlabToken : (state.gitlabConfig.token || '');
  return { url: url.replace(/\/$/, ''), token };
}

// Verifica se um projeto tem credenciais válidas (próprias ou fallback)
function projectHasCredentials(project) {
  const creds = getProjectCredentials(project);
  return !!(creds.url && creds.token);
}

// Event Listeners da UI
function setupEventListeners() {
  // Alteração de Modo (Demo / GitLab Real)
  const modeDemoBtn = document.getElementById('mode-demo-btn');
  const modeGitlabBtn = document.getElementById('mode-gitlab-btn');

  modeDemoBtn.addEventListener('click', () => setMode('demo'));
  modeGitlabBtn.addEventListener('click', () => setMode('gitlab'));

  // Modais
  document.getElementById('config-btn').addEventListener('click', () => openModal('modal-gitlab-config'));
  document.getElementById('banner-config-btn').addEventListener('click', () => openModal('modal-gitlab-config'));
  document.getElementById('manage-devs-btn').addEventListener('click', () => {
    renderManageDevsList();
    openModal('modal-manage-devs');
  });

  const manageProjectsBtn = document.getElementById('manage-projects-btn');
  if (manageProjectsBtn) {
    manageProjectsBtn.addEventListener('click', () => {
      resetProjectForm();
      renderManageProjectsList();
      openModal('modal-manage-projects');
    });
  }

  document.querySelectorAll('.modal-close, [data-close]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const modalId = e.target.getAttribute('data-close') || e.target.closest('.modal-overlay').id;
      closeModal(modalId);
    });
  });

  // Filtros & Pesquisa
  const projectSelect = document.getElementById('project-select');
  if (projectSelect) {
    projectSelect.addEventListener('change', (e) => {
      state.selectedProjectId = e.target.value;
      saveSelectedProjectToStorage();
      refreshDashboard();
    });
  }

  document.getElementById('period-select').addEventListener('change', (e) => {
    state.periodDays = parseInt(e.target.value, 10);
    refreshDashboard();
  });

  document.getElementById('status-filter').addEventListener('change', (e) => {
    state.statusFilter = e.target.value;
    renderDashboardComponents();
  });

  document.getElementById('search-dev-input').addEventListener('input', (e) => {
    state.searchTerm = e.target.value.toLowerCase().trim();
    renderDashboardComponents();
  });

  // Formulário Adicionar Dev
  document.getElementById('add-dev-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('dev-name-input').value.trim();
    const email = document.getElementById('dev-email-input').value.trim();
    const username = document.getElementById('dev-username-input').value.trim();
    const team = document.getElementById('dev-team-input').value.trim() || 'Geral';

    if (!name || !email) return;

    const newDev = {
      id: 'dev-' + Date.now(),
      name,
      email,
      username: username || email.split('@')[0],
      team
    };

    state.developers.push(newDev);
    saveDevelopersToStorage();
    e.target.reset();
    renderManageDevsList();
    refreshDashboard();
  });

  // Formulário GitLab Config
  document.getElementById('gitlab-config-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.gitlabConfig.url = document.getElementById('gitlab-url-input').value.trim().replace(/\/$/, '');
    state.gitlabConfig.token = document.getElementById('gitlab-token-input').value.trim();
    state.gitlabConfig.projectId = document.getElementById('gitlab-project-id-input').value.trim();

    saveConfigToStorage();
    closeModal('modal-gitlab-config');
    
    if (state.mode === 'gitlab') {
      refreshDashboard();
    } else {
      setMode('gitlab');
    }
  });

  // Testar Conexão GitLab
  document.getElementById('test-gitlab-connection-btn').addEventListener('click', testGitLabConnection);

  // Exportar CSV
  document.getElementById('export-csv-btn').addEventListener('click', exportAdherenceReportCSV);
}

function setMode(newMode) {
  state.mode = newMode;
  saveModeToStorage();

  document.getElementById('mode-demo-btn').classList.toggle('active', newMode === 'demo');
  document.getElementById('mode-gitlab-btn').classList.toggle('active', newMode === 'gitlab');

  const footerStatus = document.getElementById('footer-status-label');
  footerStatus.textContent = newMode === 'demo' ? 'Modo: Demonstração' : 'Modo: Conexão Real GitLab';

  refreshDashboard();
}

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    if (modalId === 'modal-gitlab-config') {
      document.getElementById('gitlab-url-input').value = state.gitlabConfig.url;
      document.getElementById('gitlab-token-input').value = state.gitlabConfig.token;
      document.getElementById('gitlab-project-id-input').value = state.gitlabConfig.projectId;
      document.getElementById('connection-status-msg').classList.add('hidden');
    }
    modal.classList.remove('hidden');
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

// Atualiza os Dados e a Interface
async function refreshDashboard() {
  const warningBanner = document.getElementById('api-warning-banner');
  const loadingIndicator = document.getElementById('matrix-loading');
  const matrixTable = document.getElementById('devs-matrix-table');

  if (state.mode === 'gitlab' && (!state.gitlabConfig.url || !state.gitlabConfig.token)) {
    warningBanner.classList.remove('hidden');
  } else {
    warningBanner.classList.add('hidden');
  }

  loadingIndicator.classList.remove('hidden');
  matrixTable.style.opacity = '0.4';

  if (state.mode === 'demo') {
    state.commitData = generateDemoCommitData(state.developers, state.periodDays);
  } else {
    state.commitData = await fetchGitLabRealCommitData(state.developers, state.periodDays);
  }

  loadingIndicator.classList.add('hidden');
  matrixTable.style.opacity = '1';

  renderDashboardComponents();
}

// Gerador de Dados Simulados Realistas para o Modo Demo
function generateDemoCommitData(devs, daysCount) {
  const data = {};
  const today = new Date();

  devs.forEach((dev, index) => {
    data[dev.id] = {};
    
    // Perfil de aderência diferente para cada dev simulado
    let adherenceRate = 0.90; // Padrão bom (ex: Ana)
    if (index === 1) adherenceRate = 0.95; // Bruno (excepcional)
    if (index === 2) adherenceRate = 0.75; // Carla (atenção)
    if (index === 3) adherenceRate = 0.40; // Diego (crítico, dias ausentes)
    if (index === 4) adherenceRate = 0.85; // Elena
    if (index === 5) adherenceRate = 0.60; // Felipe

    for (let i = 0; i < daysCount; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      const dateStr = formatDateKey(d);
      const dayOfWeek = d.getDay(); // 0 = Domingo, 6 = Sábado
      const isWeekend = (dayOfWeek === 0 || dayOfWeek === 6);

      if (isWeekend) {
        // Pouquíssimos commits no fim de semana (10% de chance)
        data[dev.id][dateStr] = Math.random() < 0.10 ? Math.floor(Math.random() * 3) + 1 : 0;
      } else {
        // Dia útil: aplicar taxa de aderência simulada
        const committed = Math.random() < adherenceRate;
        data[dev.id][dateStr] = committed ? Math.floor(Math.random() * 6) + 1 : 0;
      }
    }
  });

  return data;
}

// Busca Real de Commits na API REST do GitLab (credenciais por projeto com fallback global)
async function fetchGitLabRealCommitData(devs, daysCount) {
  const data = {};
  devs.forEach(dev => { data[dev.id] = {}; });

  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - daysCount);
  const sinceISO = sinceDate.toISOString();

  // Set para evitar contagem duplicada do mesmo commit
  const processedCommitHashes = new Set();

  // Determina quais projetos buscar
  let projectsToBuild = [];
  if (state.selectedProjectId && state.selectedProjectId !== 'all') {
    const proj = state.projects.find(p => p.id === state.selectedProjectId);
    if (proj) projectsToBuild = [proj];
  } else {
    projectsToBuild = [...state.projects];
  }

  // Filtra apenas projetos que tem gitlabProjectId e credenciais
  const projectsWithWarning = [];

  for (const proj of projectsToBuild) {
    if (!proj.gitlabProjectId) continue;

    const creds = getProjectCredentials(proj);
    if (!creds.url || !creds.token) {
      projectsWithWarning.push(proj.name);
      continue;
    }

    try {
      const commitsRes = await fetch(`${creds.url}/api/v4/projects/${encodeURIComponent(proj.gitlabProjectId)}/repository/commits?since=${sinceISO}&per_page=100`, {
        headers: { 'PRIVATE-TOKEN': creds.token }
      });

      if (!commitsRes.ok) continue;
      const commits = await commitsRes.json();

      commits.forEach(commit => {
        const commitKey = `${commit.id}-${commit.author_email}`;
        if (processedCommitHashes.has(commitKey)) return;
        processedCommitHashes.add(commitKey);

        const commitDate = new Date(commit.created_at || commit.committed_date);
        const dateStr = formatDateKey(commitDate);
        const authorEmail = (commit.author_email || '').toLowerCase();
        const authorName = (commit.author_name || '').toLowerCase();

        const matchedDev = devs.find(d => 
          d.email.toLowerCase() === authorEmail || 
          d.name.toLowerCase() === authorName ||
          (d.username && authorEmail.includes(d.username.toLowerCase()))
        );

        if (matchedDev) {
          if (!data[matchedDev.id]) data[matchedDev.id] = {};
          if (!data[matchedDev.id][dateStr]) {
            data[matchedDev.id][dateStr] = 0;
          }
          data[matchedDev.id][dateStr]++;
        }
      });
    } catch (e) {
      console.warn(`Erro ao buscar commits do projeto "${proj.name}":`, e);
    }
  }

  // Exibe aviso para projetos sem credenciais
  const warningBanner = document.getElementById('api-warning-banner');
  const alertContent = warningBanner ? warningBanner.querySelector('.alert-content') : null;
  if (projectsWithWarning.length > 0 && alertContent) {
    alertContent.innerHTML = `<strong>Projetos sem credenciais GitLab:</strong> ${projectsWithWarning.join(', ')}. Configure o token em "Gerenciar Projetos" ou nas "Configurações API" (fallback global).`;
    warningBanner.classList.remove('hidden');
  }

  return data;
}

// Testa a Conexão com o GitLab
async function testGitLabConnection() {
  const url = document.getElementById('gitlab-url-input').value.trim().replace(/\/$/, '');
  const token = document.getElementById('gitlab-token-input').value.trim();
  const statusMsg = document.getElementById('connection-status-msg');

  if (!url || !token) {
    statusMsg.className = 'connection-status error';
    statusMsg.textContent = 'Por favor, informe a URL e o Personal Access Token.';
    statusMsg.classList.remove('hidden');
    return;
  }

  statusMsg.className = 'connection-status';
  statusMsg.textContent = 'Testando conexão com o GitLab...';
  statusMsg.classList.remove('hidden');

  try {
    const res = await fetch(`${url}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token }
    });

    if (res.ok) {
      const user = await res.json();
      statusMsg.className = 'connection-status success';
      statusMsg.textContent = `Conexão efetuada com sucesso! Conectado como: ${user.name} (@${user.username})`;
    } else {
      statusMsg.className = 'connection-status error';
      statusMsg.textContent = `Falha na autenticação (HTTP ${res.status}). Verifique o token fornecido.`;
    }
  } catch (err) {
    statusMsg.className = 'connection-status error';
    statusMsg.textContent = `Erro de conexão: ${err.message}. Verifique a URL do servidor.`;
  }
}

// Cálculo da Lista de Dias no Período Selecionado
function getPeriodDaysList(count) {
  const days = [];
  const today = new Date();

  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayOfWeek = d.getDay();
    days.push({
      date: d,
      dateStr: formatDateKey(d),
      dayOfWeek,
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      label: d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }),
      weekdayLabel: d.toLocaleDateString('pt-BR', { weekday: 'narrow' })
    });
  }
  return days;
}

// Renderiza as Opções do Seletor de Projetos
function renderProjectSelectOptions() {
  const selectEl = document.getElementById('project-select');
  if (!selectEl) return;

  const optionsHtml = `
    <option value="all" ${state.selectedProjectId === 'all' ? 'selected' : ''}>Todos os Projetos (${state.developers.length} devs)</option>
    ${state.projects.map(p => {
      const devsCount = getDevsForProject(p.id).length;
      return `<option value="${p.id}" ${state.selectedProjectId === p.id ? 'selected' : ''}>${escapeHtml(p.name)} (${devsCount} devs)</option>`;
    }).join('')}
  `;

  selectEl.innerHTML = optionsHtml;
}

// Renderização dos Componentes
function renderDashboardComponents() {
  renderProjectSelectOptions();

  const periodDaysList = getPeriodDaysList(state.periodDays);
  const activeDevs = getDevsForProject(state.selectedProjectId);

  // Calcula estatísticas individuais por dev
  const devStatsList = activeDevs.map(dev => {
    let workingDaysTotal = 0;
    let workingDaysWithCommits = 0;
    let totalCommits = 0;
    let currentStreak = 0;
    let isStreakActive = true;
    let missingWorkdaysStreak = 0;
    let todayCommitted = false;

    const todayStr = formatDateKey(new Date());

    periodDaysList.forEach(day => {
      const commitsOnDay = (state.commitData[dev.id] && state.commitData[dev.id][day.dateStr]) || 0;
      totalCommits += commitsOnDay;

      if (day.dateStr === todayStr && commitsOnDay > 0) {
        todayCommitted = true;
      }

      if (!day.isWeekend) {
        workingDaysTotal++;
        if (commitsOnDay > 0) {
          workingDaysWithCommits++;
        }
      }
    });

    // Calcula streak de dias úteis com commit (do mais recente para trás)
    for (let i = periodDaysList.length - 1; i >= 0; i--) {
      const day = periodDaysList[i];
      if (day.isWeekend) continue; // Ignora fins de semana no cálculo de streak

      const commits = (state.commitData[dev.id] && state.commitData[dev.id][day.dateStr]) || 0;
      
      if (commits > 0 && isStreakActive) {
        currentStreak++;
      } else {
        isStreakActive = false;
      }

      if (commits === 0) {
        missingWorkdaysStreak++;
      } else {
        break; // Interrompe contagem de ausência no primeiro commit encontrado
      }
    }

    const adherenceRate = workingDaysTotal > 0 ? Math.round((workingDaysWithCommits / workingDaysTotal) * 100) : 0;
    
    let statusCategory = 'compliant';
    if (adherenceRate < 50) statusCategory = 'critical';
    else if (adherenceRate < 80) statusCategory = 'warning';

    return {
      dev,
      workingDaysTotal,
      workingDaysWithCommits,
      totalCommits,
      currentStreak,
      missingWorkdaysStreak,
      todayCommitted,
      adherenceRate,
      statusCategory
    };
  });

  // Filtra desenvolvedores por busca e status
  const filteredDevStats = devStatsList.filter(item => {
    const matchesSearch = item.dev.name.toLowerCase().includes(state.searchTerm) || 
                          item.dev.email.toLowerCase().includes(state.searchTerm) ||
                          item.dev.team.toLowerCase().includes(state.searchTerm);

    const matchesStatus = state.statusFilter === 'all' || item.statusCategory === state.statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Renderiza Seções
  renderMetricsSummary(devStatsList);
  renderMatrixTable(periodDaysList, filteredDevStats);
  renderDevCardsGrid(filteredDevStats);
}

// Renderiza Métricas Globais do Topo
function renderMetricsSummary(devStatsList) {
  const totalDevs = devStatsList.length;
  
  let totalAdherenceSum = 0;
  let commitsTodayTotal = 0;
  let devsCommittedTodayCount = 0;
  let atRiskDevsCount = 0;

  devStatsList.forEach(item => {
    totalAdherenceSum += item.adherenceRate;
    if (item.todayCommitted) {
      devsCommittedTodayCount++;
    }
    // Considera em risco quem tem aderência baixa ou está sem commit há 2+ dias úteis
    if (item.adherenceRate < 70 || item.missingWorkdaysStreak >= 2) {
      atRiskDevsCount++;
    }
  });

  const teamAdherence = totalDevs > 0 ? Math.round(totalAdherenceSum / totalDevs) : 0;

  document.getElementById('metric-team-adherence').textContent = `${teamAdherence}%`;
  document.getElementById('team-progress-bar').style.width = `${teamAdherence}%`;
  document.getElementById('metric-total-devs').textContent = totalDevs;
  
  // Commits hoje (soma de commits do dia atual)
  const todayStr = formatDateKey(new Date());
  let commitsTodaySum = 0;
  devStatsList.forEach(item => {
    commitsTodaySum += (state.commitData[item.dev.id] && state.commitData[item.dev.id][todayStr]) || 0;
  });

  document.getElementById('metric-commits-today').textContent = commitsTodaySum;
  document.getElementById('metric-devs-committed-today').textContent = `${devsCommittedTodayCount} de ${totalDevs} devs comitaram hoje`;
  document.getElementById('metric-at-risk-devs').textContent = atRiskDevsCount;
}

// Renderiza a Tabela Matriz Diária
function renderMatrixTable(periodDaysList, filteredDevStats) {
  const headerRow = document.getElementById('matrix-header-row');
  const bodyRows = document.getElementById('matrix-body-rows');

  headerRow.innerHTML = `
    <th class="col-dev-name">Desenvolvedor</th>
    <th title="Taxa de Aderência em dias úteis">% Aderência</th>
    <th title="Sequência atual de dias úteis com commit">Streak</th>
    ${periodDaysList.map(day => `
      <th class="${day.isWeekend ? 'weekend-header' : ''}">
        <div>${day.weekdayLabel}</div>
        <div style="font-size:0.7rem; color:var(--text-dim);">${day.label}</div>
      </th>
    `).join('')}
  `;

  if (filteredDevStats.length === 0) {
    bodyRows.innerHTML = `
      <tr>
        <td colspan="${3 + periodDaysList.length}" style="text-align:center; padding: 2rem; color: var(--text-muted);">
          Nenhum desenvolvedor encontrado com os filtros aplicados.
        </td>
      </tr>
    `;
    return;
  }

  bodyRows.innerHTML = filteredDevStats.map(item => {
    const initials = item.dev.name.split(' ').map(n => n[0]).slice(0, 2).join('');
    const badgeClass = item.statusCategory === 'compliant' ? 'badge-success' : 
                       item.statusCategory === 'warning' ? 'badge-warning' : 'badge-danger';

    return `
      <tr>
        <td class="col-dev-name">
          <div class="dev-info-cell">
            <div class="dev-avatar-sm">${initials}</div>
            <div>
              <div class="dev-name-text">${escapeHtml(item.dev.name)}</div>
              <div class="dev-email-sub">${escapeHtml(item.dev.team)}</div>
            </div>
          </div>
        </td>
        <td>
          <span class="badge ${badgeClass}">${item.adherenceRate}%</span>
        </td>
        <td>
          <span style="font-family:var(--font-mono); font-weight:600; color:${item.currentStreak > 0 ? 'var(--color-success)' : 'var(--text-dim)'}">
            🔥 ${item.currentStreak}d
          </span>
        </td>
        ${periodDaysList.map(day => {
          const commits = (state.commitData[item.dev.id] && state.commitData[item.dev.id][day.dateStr]) || 0;
          let cellClass = 'weekend';
          let title = `${day.label} (${day.weekdayLabel}): Fim de semana`;

          if (!day.isWeekend) {
            if (commits > 0) {
              cellClass = 'committed';
              title = `${day.label}: ${commits} commit(s) por ${item.dev.name}`;
            } else {
              cellClass = 'missing';
              title = `${day.label}: Sem commits registrado!`;
            }
          } else if (commits > 0) {
            cellClass = 'committed';
            title = `${day.label}: ${commits} commit(s) (Fim de semana)`;
          }

          return `
            <td class="day-cell">
              <div class="cell-status ${cellClass}" title="${escapeHtml(title)}">
                ${commits > 0 ? commits : ''}
              </div>
            </td>
          `;
        }).join('')}
      </tr>
    `;
  }).join('');
}

// Renderiza Cards Individuais dos Desenvolvedores
function renderDevCardsGrid(filteredDevStats) {
  const grid = document.getElementById('dev-cards-grid');

  if (filteredDevStats.length === 0) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = filteredDevStats.map(item => {
    const initials = item.dev.name.split(' ').map(n => n[0]).slice(0, 2).join('');
    const badgeClass = item.statusCategory === 'compliant' ? 'badge-success' : 
                       item.statusCategory === 'warning' ? 'badge-warning' : 'badge-danger';
    
    const badgeLabel = item.statusCategory === 'compliant' ? 'Conforme' : 
                        item.statusCategory === 'warning' ? 'Atenção' : 'Crítico';

    return `
      <div class="dev-card glass-panel">
        <div class="dev-card-header">
          <div class="dev-card-identity">
            <div class="dev-avatar-lg">${initials}</div>
            <div>
              <h3 style="font-size:1rem; font-weight:600; color:#fff;">${escapeHtml(item.dev.name)}</h3>
              <span style="font-size:0.8rem; color:var(--text-dim);">${escapeHtml(item.dev.email)}</span>
            </div>
          </div>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>

        <div class="dev-card-stats">
          <div class="stat-item">
            <span class="stat-label">Aderência Dias Úteis</span>
            <span class="stat-val" style="color: ${item.adherenceRate >= 80 ? 'var(--color-success)' : item.adherenceRate >= 50 ? 'var(--color-warning)' : 'var(--color-danger)'}">
              ${item.adherenceRate}%
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Sequência (Streak)</span>
            <span class="stat-val">🔥 ${item.currentStreak} dias</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Dias Cumpridos</span>
            <span class="stat-val">${item.workingDaysWithCommits} / ${item.workingDaysTotal}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">Total Commits</span>
            <span class="stat-val">${item.totalCommits}</span>
          </div>
        </div>

        <div class="dev-card-footer">
          <span>Squad: <strong>${escapeHtml(item.dev.team)}</strong></span>
          ${item.missingWorkdaysStreak > 0 ? `
            <span style="color:var(--color-danger); font-weight:500;">
              ⚠️ Sem commit há ${item.missingWorkdaysStreak}d útil
            </span>
          ` : `
            <span style="color:var(--color-success); font-weight:500;">
              ✓ Em dia
            </span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

// Renderiza a Lista do Modal de Gerenciamento de Devs
function renderManageDevsList() {
  const container = document.getElementById('devs-manage-list');
  container.innerHTML = state.developers.map(dev => `
    <li class="dev-manage-item">
      <div>
        <strong>${escapeHtml(dev.name)}</strong> (${escapeHtml(dev.email)})
        <div style="font-size:0.75rem; color:var(--text-dim);">Squad: ${escapeHtml(dev.team)} | User: @${escapeHtml(dev.username)}</div>
      </div>
      <button class="btn-icon-danger" data-remove-dev="${dev.id}" title="Remover Desenvolvedor">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </li>
  `).join('');

  container.querySelectorAll('[data-remove-dev]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idToRemove = e.currentTarget.getAttribute('data-remove-dev');
      state.developers = state.developers.filter(d => d.id !== idToRemove);
      saveDevelopersToStorage();
      renderManageDevsList();
      refreshDashboard();
    });
  });
}

// Renderiza a Lista e Formulário no Modal de Gerenciamento de Projetos
function renderManageProjectsList() {
  const container = document.getElementById('projects-manage-list');
  const checkboxContainer = document.getElementById('project-devs-checkbox-container');
  const editId = document.getElementById('edit-project-id').value;

  const currentEditingProject = editId ? state.projects.find(p => p.id === editId) : null;
  const selectedDevIds = currentEditingProject ? (currentEditingProject.devIds || []) : [];

  // Renderiza Checkboxes dos Desenvolvedores
  if (checkboxContainer) {
    checkboxContainer.innerHTML = state.developers.map(dev => {
      const isChecked = selectedDevIds.includes(dev.id);
      return `
        <label class="checkbox-item">
          <input type="checkbox" name="project-dev-cb" value="${dev.id}" ${isChecked ? 'checked' : ''}>
          <span>${escapeHtml(dev.name)}</span>
        </label>
      `;
    }).join('');
  }

  // Renderiza Lista de Projetos
  if (container) {
    container.innerHTML = state.projects.map(proj => {
      const devCount = (proj.devIds || []).length;
      const hasCreds = projectHasCredentials(proj);
      const hasOwnCreds = !!(proj.gitlabUrl && proj.gitlabToken);
      const credsBadge = hasOwnCreds 
        ? '<span class="badge badge-success" style="font-size:0.65rem;">Token Próprio</span>'
        : (hasCreds ? '<span class="badge badge-subtle" style="font-size:0.65rem;">Fallback Global</span>' : '<span class="badge badge-danger" style="font-size:0.65rem;">Sem Token</span>');

      return `
        <li class="dev-manage-item">
          <div>
            <strong>${escapeHtml(proj.name)}</strong> ${proj.gitlabProjectId ? `<small style="color:var(--text-dim);">(ID GitLab: ${escapeHtml(proj.gitlabProjectId)})</small>` : ''} ${credsBadge}
            <div style="font-size:0.75rem; color:var(--text-dim);">${escapeHtml(proj.description || 'Sem descrição')} | <strong>${devCount} dev(s) vinculados</strong></div>
          </div>
          <div style="display:flex; gap:0.4rem;">
            <button class="btn btn-secondary btn-sm" data-edit-project="${proj.id}" title="Editar Projeto">
              ✏️
            </button>
            <button class="btn-icon-danger" data-remove-project="${proj.id}" title="Remover Projeto">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </li>
      `;
    }).join('');

    // Eventos de Editar
    container.querySelectorAll('[data-edit-project]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const id = e.currentTarget.getAttribute('data-edit-project');
        const proj = state.projects.find(p => p.id === id);
        if (!proj) return;

        document.getElementById('edit-project-id').value = proj.id;
        document.getElementById('project-name-input').value = proj.name;
        document.getElementById('project-gitlab-id-input').value = proj.gitlabProjectId || '';
        document.getElementById('project-desc-input').value = proj.description || '';
        document.getElementById('project-gitlab-url-input').value = proj.gitlabUrl || '';
        document.getElementById('project-gitlab-token-input').value = proj.gitlabToken || '';
        document.getElementById('project-form-title').textContent = 'Editar Projeto';
        document.getElementById('save-project-submit-btn').textContent = 'Atualizar Projeto';
        document.getElementById('cancel-project-edit-btn').classList.remove('hidden');
        document.getElementById('project-connection-status').classList.add('hidden');

        renderManageProjectsList();
      });
    });

    // Eventos de Remover
    container.querySelectorAll('[data-remove-project]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const idToRemove = e.currentTarget.getAttribute('data-remove-project');
        state.projects = state.projects.filter(p => p.id !== idToRemove);
        
        // Remove projeto das referências dos devs
        state.developers.forEach(dev => {
          if (dev.projectIds) {
            dev.projectIds = dev.projectIds.filter(pid => pid !== idToRemove);
          }
        });

        if (state.selectedProjectId === idToRemove) {
          state.selectedProjectId = 'all';
          saveSelectedProjectToStorage();
        }

        saveProjectsToStorage();
        saveDevelopersToStorage();
        resetProjectForm();
        renderManageProjectsList();
        refreshDashboard();
      });
    });
  }
}

function resetProjectForm() {
  document.getElementById('edit-project-id').value = '';
  document.getElementById('add-project-form').reset();
  document.getElementById('project-form-title').textContent = 'Adicionar Novo Projeto';
  document.getElementById('save-project-submit-btn').textContent = 'Salvar Projeto';
  document.getElementById('cancel-project-edit-btn').classList.add('hidden');
  const connStatus = document.getElementById('project-connection-status');
  if (connStatus) connStatus.classList.add('hidden');
}

// Configuração do Submit do Formulário de Projeto
document.addEventListener('DOMContentLoaded', () => {
  const addProjectForm = document.getElementById('add-project-form');
  const cancelEditBtn = document.getElementById('cancel-project-edit-btn');

  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', () => {
      resetProjectForm();
      renderManageProjectsList();
    });
  }

  if (addProjectForm) {
    addProjectForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const editId = document.getElementById('edit-project-id').value;
      const name = document.getElementById('project-name-input').value.trim();
      const gitlabProjectId = document.getElementById('project-gitlab-id-input').value.trim();
      const description = document.getElementById('project-desc-input').value.trim();
      const gitlabUrl = document.getElementById('project-gitlab-url-input').value.trim().replace(/\/$/, '');
      const gitlabToken = document.getElementById('project-gitlab-token-input').value.trim();

      // Pega IDs dos desenvolvedores marcados nos checkboxes
      const checkedDevBoxes = document.querySelectorAll('input[name="project-dev-cb"]:checked');
      const selectedDevIds = Array.from(checkedDevBoxes).map(cb => cb.value);

      if (!name) return;

      if (editId) {
        // Atualizar Projeto Existente
        const projectIndex = state.projects.findIndex(p => p.id === editId);
        if (projectIndex !== -1) {
          state.projects[projectIndex] = {
            ...state.projects[projectIndex],
            name,
            gitlabProjectId,
            description,
            gitlabUrl,
            gitlabToken,
            devIds: selectedDevIds
          };
        }
      } else {
        // Criar Novo Projeto
        const newProj = {
          id: 'proj-' + Date.now(),
          name,
          gitlabProjectId,
          description,
          gitlabUrl,
          gitlabToken,
          devIds: selectedDevIds
        };
        state.projects.push(newProj);
      }

      // Atualiza referências cruzadas nos devs
      const targetProjectId = editId || state.projects[state.projects.length - 1].id;
      state.developers.forEach(dev => {
        if (!dev.projectIds) dev.projectIds = [];
        if (selectedDevIds.includes(dev.id)) {
          if (!dev.projectIds.includes(targetProjectId)) dev.projectIds.push(targetProjectId);
        } else {
          dev.projectIds = dev.projectIds.filter(pid => pid !== targetProjectId);
        }
      });

      saveProjectsToStorage();
      saveDevelopersToStorage();
      resetProjectForm();
      renderManageProjectsList();
      refreshDashboard();
    });
  }

  // Botão Testar Conexão do Projeto
  const testProjConnBtn = document.getElementById('test-project-connection-btn');
  if (testProjConnBtn) {
    testProjConnBtn.addEventListener('click', testProjectConnection);
  }
});

// Testa a conexão de um projeto específico (URL+Token do formulário ou fallback global)
async function testProjectConnection() {
  const urlInput = document.getElementById('project-gitlab-url-input').value.trim().replace(/\/$/, '');
  const tokenInput = document.getElementById('project-gitlab-token-input').value.trim();
  const statusMsg = document.getElementById('project-connection-status');

  // Se nenhum foi informado, usa fallback global
  const url = urlInput || (state.gitlabConfig.url || '').replace(/\/$/, '');
  const token = tokenInput || (state.gitlabConfig.token || '');

  if (!url || !token) {
    statusMsg.className = 'connection-status error';
    statusMsg.textContent = 'Sem credenciais: preencha URL/Token aqui ou configure o fallback global.';
    statusMsg.classList.remove('hidden');
    return;
  }

  statusMsg.className = 'connection-status';
  statusMsg.textContent = 'Testando...';
  statusMsg.classList.remove('hidden');

  try {
    const res = await fetch(`${url}/api/v4/user`, {
      headers: { 'PRIVATE-TOKEN': token }
    });
    if (res.ok) {
      const user = await res.json();
      const source = urlInput && tokenInput ? 'Token Próprio' : 'Fallback Global';
      statusMsg.className = 'connection-status success';
      statusMsg.textContent = `✓ Conectado como ${user.name || user.username} (${source})`;
    } else {
      statusMsg.className = 'connection-status error';
      statusMsg.textContent = `Erro HTTP ${res.status}: verifique a URL e o token.`;
    }
  } catch (err) {
    statusMsg.className = 'connection-status error';
    statusMsg.textContent = `Erro de rede: ${err.message}`;
  }
}

// Exportar Relatório de Aderência em CSV
function exportAdherenceReportCSV() {
  const periodDaysList = getPeriodDaysList(state.periodDays);
  
  let csvContent = 'data:text/csv;charset=utf-8,';
  csvContent += 'Nome,Email,Squad,Aderencia_Percentual,Dias_Com_Commit,Total_Dias_Uteis,Streak_Atual,Commits_Totais\n';

  state.developers.forEach(dev => {
    let workingDaysTotal = 0;
    let workingDaysWithCommits = 0;
    let totalCommits = 0;
    let currentStreak = 0;
    let isStreakActive = true;

    periodDaysList.forEach(day => {
      const commits = (state.commitData[dev.id] && state.commitData[dev.id][day.dateStr]) || 0;
      totalCommits += commits;

      if (!day.isWeekend) {
        workingDaysTotal++;
        if (commits > 0) workingDaysWithCommits++;
      }
    });

    for (let i = periodDaysList.length - 1; i >= 0; i--) {
      const day = periodDaysList[i];
      if (day.isWeekend) continue;
      const commits = (state.commitData[dev.id] && state.commitData[dev.id][day.dateStr]) || 0;
      if (commits > 0 && isStreakActive) {
        currentStreak++;
      } else {
        isStreakActive = false;
      }
    }

    const rate = workingDaysTotal > 0 ? Math.round((workingDaysWithCommits / workingDaysTotal) * 100) : 0;

    csvContent += `"${dev.name}","${dev.email}","${dev.team}",${rate}%,${workingDaysWithCommits},${workingDaysTotal},${currentStreak},${totalCommits}\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `CommitDay_Relatorio_Aderencia_${formatDateKey(new Date())}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Helpers Utilitários
function formatDateKey(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
